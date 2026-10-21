/**
 * Kiểm thử cho `packages/khach-hang` — tầng gọi Medusa.
 *
 * Vì sao đáng viết: trước khi gộp, ba storefront giữ ba bản sao y hệt nhau của
 * đoạn mã này. Giờ chỉ còn một bản — nghĩa là một lỗi ở đây làm hỏng cả ba
 * site cùng lúc. Đổi lại, sửa một lần là cả ba cùng được vá.
 *
 * Hai hành vi được khoá chặt ở đây là hai lỗi ĐÃ TỪNG xảy ra thật:
 *   1. Đăng ký thiếu bước 3 → token có actor_id rỗng → vòng lặp chuyển hướng
 *   2. Kiểm tra phiên bằng "cookie có tồn tại" thay vì hỏi máy chủ
 */

import { dichLoi } from "../loi"
import { goiDangNhap, goiDangKy, goiLayHoSo } from "../api"

/** Ghi lại mọi lời gọi fetch để khẳng định đúng thứ tự và đúng tham số. */
interface LoiGoi {
  duongDan: string
  method: string
  than: any
  headers: Record<string, string>
}

let cacLoiGoi: LoiGoi[] = []
let fetchGoc: typeof globalThis.fetch

/** Xếp sẵn các phản hồi, trả lần lượt theo thứ tự gọi. */
function datPhanHoi(danhSach: Array<{ status: number; body: any }>) {
  let i = 0
  globalThis.fetch = (async (url: any, init: any = {}) => {
    const headers = (init.headers || {}) as Record<string, string>
    cacLoiGoi.push({
      duongDan: String(url).replace("http://backend:9000", ""),
      method: init.method || "GET",
      than: init.body ? JSON.parse(init.body) : undefined,
      headers,
    })

    const ph = danhSach[i] ?? danhSach[danhSach.length - 1]
    i++
    return {
      ok: ph.status >= 200 && ph.status < 300,
      status: ph.status,
      text: async () => JSON.stringify(ph.body),
    } as any
  }) as any
}

beforeEach(() => {
  cacLoiGoi = []
  fetchGoc = globalThis.fetch
  process.env.CONFIG_API_MEDUSA_URL = "http://backend:9000"
  process.env.CONFIG_PUBLISHABLE_KEY_MEDUSA = "pk_test"
})

afterEach(() => {
  globalThis.fetch = fetchGoc
  delete process.env.CONFIG_API_MEDUSA_URL
  delete process.env.CONFIG_PUBLISHABLE_KEY_MEDUSA
})

describe("Dịch lỗi sang tiếng Việt", () => {
  it("email trùng", () => {
    expect(dichLoi(400, "Identity with email already exists")).toContain("đã được đăng ký")
  })

  it("sai mật khẩu — KHÔNG tiết lộ email có tồn tại hay không", () => {
    const cau = dichLoi(401, "Invalid email or password")
    expect(cau).toBe("Email hoặc mật khẩu chưa đúng.")
    expect(cau).not.toContain("email or password")
  })

  it("gọi quá nhanh", () => {
    expect(dichLoi(429, "")).toContain("thử lại sau")
  })

  it("lỗi lạ trả câu chung, KHÔNG ghép nguyên văn tiếng Anh", () => {
    const cau = dichLoi(500, 'relation "customer" does not exist')
    expect(cau).toBe("Hệ thống đang bận, anh/chị vui lòng thử lại.")
    expect(cau).not.toContain("customer")
  })
})

describe("Đăng nhập", () => {
  it("trả token khi thành công", async () => {
    datPhanHoi([{ status: 200, body: { token: "jwt-that" } }])

    const kq = await goiDangNhap("A@Vphold.test ", "Matkhau123!")
    expect(kq).toEqual({ ok: true, token: "jwt-that" })
  })

  it("chuẩn hoá email: bỏ khoảng trắng và về chữ thường", async () => {
    datPhanHoi([{ status: 200, body: { token: "x" } }])
    await goiDangNhap("  Nguyen@VPHold.TEST  ", "Matkhau123!")

    expect(cacLoiGoi[0].than.email).toBe("nguyen@vphold.test")
  })

  it("KHÔNG gửi publishable key tới endpoint /auth/*", async () => {
    datPhanHoi([{ status: 200, body: { token: "x" } }])
    await goiDangNhap("a@b.test", "Matkhau123!")

    expect(cacLoiGoi[0].duongDan).toBe("/auth/customer/emailpass")
    expect(cacLoiGoi[0].headers["x-publishable-api-key"]).toBeUndefined()
  })

  it("thiếu email hoặc mật khẩu thì không gọi mạng", async () => {
    datPhanHoi([{ status: 200, body: {} }])

    expect(await goiDangNhap("", "x")).toEqual({
      ok: false,
      loi: "Anh/chị nhập đủ email và mật khẩu giúp em.",
    })
    expect(cacLoiGoi).toHaveLength(0)
  })

  it("máy chủ trả 200 nhưng thiếu token thì coi là sai mật khẩu", async () => {
    datPhanHoi([{ status: 200, body: {} }])
    expect(await goiDangNhap("a@b.test", "x")).toEqual({
      ok: false,
      loi: "Email hoặc mật khẩu chưa đúng.",
    })
  })

  it("mất mạng thì báo lỗi tiếng Việt, không ném exception", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED")
    }) as any

    expect(await goiDangNhap("a@b.test", "Matkhau123!")).toEqual({
      ok: false,
      loi: "Không kết nối được máy chủ.",
    })
  })
})

describe("⚠️ Đăng ký — luồng BA bước bắt buộc", () => {
  const BA_PHAN_HOI = [
    { status: 200, body: { token: "token-dang-ky-actor-id-RONG" } },
    { status: 200, body: { customer: { id: "cus_1" } } },
    { status: 200, body: { token: "token-phien-actor-id-DUNG" } },
  ]

  it("gọi đủ 3 endpoint, ĐÚNG thứ tự", async () => {
    datPhanHoi(BA_PHAN_HOI)
    await goiDangKy("a@b.test", "Matkhau123!", "Nguyễn", "Sỹ")

    expect(cacLoiGoi.map((g) => g.duongDan)).toEqual([
      "/auth/customer/emailpass/register",
      "/store/customers",
      "/auth/customer/emailpass",
    ])
  })

  it("🔴 trả token của bước 3, KHÔNG phải token đăng ký", async () => {
    datPhanHoi(BA_PHAN_HOI)
    const kq = await goiDangKy("a@b.test", "Matkhau123!", "Nguyễn", "Sỹ")

    // Đây là bài kiểm thử quan trọng nhất tệp này. Trả nhầm token bước 1
    // (actor_id rỗng) là tái hiện đúng lỗi vòng lặp chuyển hướng đã gặp.
    expect(kq).toEqual({ ok: true, token: "token-phien-actor-id-DUNG" })
    expect(JSON.stringify(kq)).not.toContain("RONG")
  })

  it("bước 2 dùng Bearer token của bước 1 và CÓ publishable key", async () => {
    datPhanHoi(BA_PHAN_HOI)
    await goiDangKy("a@b.test", "Matkhau123!", "Nguyễn", "Sỹ")

    const buoc2 = cacLoiGoi[1]
    expect(buoc2.headers["Authorization"]).toBe("Bearer token-dang-ky-actor-id-RONG")
    expect(buoc2.headers["x-publishable-api-key"]).toBe("pk_test")
  })

  it("giữ nguyên dấu tiếng Việt của họ tên", async () => {
    datPhanHoi(BA_PHAN_HOI)
    await goiDangKy("a@b.test", "Matkhau123!", "  Nguyễn  ", "  Thanh Phong  ")

    expect(cacLoiGoi[1].than).toMatchObject({
      first_name: "Nguyễn",
      last_name: "Thanh Phong",
    })
  })

  it("bước 1 hỏng thì DỪNG, không gọi tiếp", async () => {
    datPhanHoi([{ status: 400, body: { message: "Identity already exists" } }])

    const kq = await goiDangKy("a@b.test", "Matkhau123!", "N", "S")
    expect(kq.ok).toBe(false)
    expect(cacLoiGoi).toHaveLength(1)
  })

  it("bước 2 hỏng thì DỪNG, không đăng nhập lại", async () => {
    datPhanHoi([
      { status: 200, body: { token: "t1" } },
      { status: 500, body: { message: "boom" } },
    ])

    const kq = await goiDangKy("a@b.test", "Matkhau123!", "N", "S")
    expect(kq.ok).toBe(false)
    expect(cacLoiGoi).toHaveLength(2)
  })

  it("chặn mật khẩu dưới 8 ký tự trước khi gọi mạng", async () => {
    datPhanHoi([{ status: 200, body: {} }])

    expect(await goiDangKy("a@b.test", "1234567", "N", "S")).toEqual({
      ok: false,
      loi: "Mật khẩu cần tối thiểu 8 ký tự.",
    })
    expect(cacLoiGoi).toHaveLength(0)
  })

  it("chặn email không hợp lệ trước khi gọi mạng", async () => {
    datPhanHoi([{ status: 200, body: {} }])

    expect(await goiDangKy("khong-phai-email", "Matkhau123!", "N", "S")).toEqual({
      ok: false,
      loi: "Email chưa hợp lệ.",
    })
    expect(cacLoiGoi).toHaveLength(0)
  })
})

describe("⚠️ Lấy hồ sơ — nguồn sự thật cho câu hỏi 'đã đăng nhập chưa'", () => {
  it("trả hồ sơ khi token còn hiệu lực", async () => {
    datPhanHoi([{ status: 200, body: { customer: { id: "cus_1", email: "a@b.test" } } }])

    expect(await goiLayHoSo("jwt")).toEqual({ id: "cus_1", email: "a@b.test" })
  })

  it("🔴 token hết hạn (401) trả null — KHÔNG được coi là đã đăng nhập", async () => {
    datPhanHoi([{ status: 401, body: { message: "Unauthorized" } }])
    expect(await goiLayHoSo("jwt-het-han")).toBeNull()
  })

  it("token rỗng thì không gọi mạng", async () => {
    datPhanHoi([{ status: 200, body: {} }])

    expect(await goiLayHoSo("")).toBeNull()
    expect(cacLoiGoi).toHaveLength(0)
  })

  it("gửi kèm Bearer token và publishable key", async () => {
    datPhanHoi([{ status: 200, body: { customer: { id: "x", email: "a@b" } } }])
    await goiLayHoSo("jwt-abc")

    expect(cacLoiGoi[0].headers["Authorization"]).toBe("Bearer jwt-abc")
    expect(cacLoiGoi[0].headers["x-publishable-api-key"]).toBe("pk_test")
  })

  it("200 nhưng thân rỗng thì trả null, không ném lỗi", async () => {
    datPhanHoi([{ status: 200, body: {} }])
    expect(await goiLayHoSo("jwt")).toBeNull()
  })
})

describe("Thiếu publishable key", () => {
  it("endpoint /store/* báo lỗi rõ ràng thay vì gọi rồi hỏng", async () => {
    delete process.env.CONFIG_PUBLISHABLE_KEY_MEDUSA
    datPhanHoi([{ status: 200, body: {} }])

    expect(await goiLayHoSo("jwt")).toBeNull()
    expect(cacLoiGoi).toHaveLength(0)
  })

  it("endpoint /auth/* vẫn chạy được vì không cần khoá", async () => {
    delete process.env.CONFIG_PUBLISHABLE_KEY_MEDUSA
    datPhanHoi([{ status: 200, body: { token: "t" } }])

    expect(await goiDangNhap("a@b.test", "Matkhau123!")).toEqual({ ok: true, token: "t" })
  })
})
