/**
 * Kiểm thử quản lý phiên.
 *
 * Phần này TRƯỚC ĐÂY KHÔNG KIỂM THỬ ĐƯỢC vì nằm chung với `next/headers`.
 * Sau khi tiêm kho cookie từ ngoài vào, nó chạy được dưới Jest với một kho
 * cookie giả — và đây đúng là chỗ đã gây vòng lặp chuyển hướng vô tận.
 */

import { taoPhien, TEN_COOKIE, HAN_COOKIE_GIAY, type KhoCookiePhien } from "../phien"

/** Kho cookie giả, ghi lại mọi thao tác để khẳng định hành vi. */
function taoKhoGia(banDau: Record<string, string> = {}) {
  const du_lieu = new Map(Object.entries(banDau))
  const nhatKy: string[] = []

  const kho: KhoCookiePhien = {
    doc: (ten) => {
      nhatKy.push(`doc:${ten}`)
      return du_lieu.get(ten)
    },
    ghi: (ten, giaTri, hanGiay) => {
      nhatKy.push(`ghi:${ten}:${hanGiay}`)
      du_lieu.set(ten, giaTri)
    },
    xoa: (ten) => {
      nhatKy.push(`xoa:${ten}`)
      du_lieu.delete(ten)
    },
  }

  return { kho, du_lieu, nhatKy }
}

let fetchGoc: typeof globalThis.fetch

function datPhanHoi(danhSach: Array<{ status: number; body: any }>) {
  let i = 0
  globalThis.fetch = (async () => {
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
  fetchGoc = globalThis.fetch
  process.env.CONFIG_API_MEDUSA_URL = "http://backend:9000"
  process.env.CONFIG_PUBLISHABLE_KEY_MEDUSA = "pk_test"
})

afterEach(() => {
  globalThis.fetch = fetchGoc
  delete process.env.CONFIG_API_MEDUSA_URL
  delete process.env.CONFIG_PUBLISHABLE_KEY_MEDUSA
})

describe("Đăng nhập ghi cookie", () => {
  it("ghi đúng tên cookie và đúng hạn 7 ngày", async () => {
    const { kho, du_lieu, nhatKy } = taoKhoGia()
    datPhanHoi([{ status: 200, body: { token: "jwt-abc" } }])

    const phien = taoPhien(async () => kho)
    expect(await phien.dangNhap("a@b.test", "Matkhau123!")).toEqual({ ok: true })

    expect(du_lieu.get(TEN_COOKIE)).toBe("jwt-abc")
    expect(nhatKy).toContain(`ghi:${TEN_COOKIE}:${HAN_COOKIE_GIAY}`)
    expect(HAN_COOKIE_GIAY).toBe(60 * 60 * 24 * 7)
  })

  it("đăng nhập hỏng thì KHÔNG ghi cookie", async () => {
    const { kho, du_lieu } = taoKhoGia()
    datPhanHoi([{ status: 401, body: { message: "Invalid" } }])

    const phien = taoPhien(async () => kho)
    const kq = await phien.dangNhap("a@b.test", "sai")

    expect(kq).toEqual({ ok: false, loi: "Email hoặc mật khẩu chưa đúng." })
    expect(du_lieu.has(TEN_COOKIE)).toBe(false)
  })
})

describe("⚠️ Đăng ký ghi token của BƯỚC 3", () => {
  it("cookie chứa token phiên, KHÔNG phải token đăng ký", async () => {
    const { kho, du_lieu } = taoKhoGia()
    datPhanHoi([
      { status: 200, body: { token: "token-dang-ky-RONG" } },
      { status: 200, body: { customer: { id: "cus_1" } } },
      { status: 200, body: { token: "token-phien-DUNG" } },
    ])

    const phien = taoPhien(async () => kho)
    expect(await phien.dangKy("a@b.test", "Matkhau123!", "Nguyễn", "Sỹ")).toEqual({ ok: true })

    expect(du_lieu.get(TEN_COOKIE)).toBe("token-phien-DUNG")
    expect(du_lieu.get(TEN_COOKIE)).not.toBe("token-dang-ky-RONG")
  })

  it("đăng ký hỏng giữa chừng thì KHÔNG ghi cookie", async () => {
    const { kho, du_lieu } = taoKhoGia()
    datPhanHoi([
      { status: 200, body: { token: "t1" } },
      { status: 500, body: { message: "boom" } },
    ])

    const phien = taoPhien(async () => kho)
    expect((await phien.dangKy("a@b.test", "Matkhau123!", "N", "S")).ok).toBe(false)
    expect(du_lieu.has(TEN_COOKIE)).toBe(false)
  })
})

describe("Đăng xuất", () => {
  it("xoá cookie phiên", async () => {
    const { kho, du_lieu, nhatKy } = taoKhoGia({ [TEN_COOKIE]: "jwt" })

    const phien = taoPhien(async () => kho)
    await phien.dangXuat()

    expect(du_lieu.has(TEN_COOKIE)).toBe(false)
    expect(nhatKy).toContain(`xoa:${TEN_COOKIE}`)
  })
})

describe("🔴 daDangNhap — chống vòng lặp chuyển hướng", () => {
  it("KHÔNG có cookie → false, và không gọi mạng", async () => {
    const { kho } = taoKhoGia()
    let daGoiMang = false
    globalThis.fetch = (async () => {
      daGoiMang = true
      return { ok: true, status: 200, text: async () => "{}" } as any
    }) as any

    const phien = taoPhien(async () => kho)
    expect(await phien.daDangNhap()).toBe(false)
    expect(daGoiMang).toBe(false)
  })

  it("CÓ cookie nhưng máy chủ trả 401 → false", async () => {
    // Đây là ca đã gây vòng lặp vô tận trong thực tế: cookie còn nhưng token
    // hết hạn. Nếu hàm này chỉ xem cookie thì sẽ trả true và hệ thống kẹt.
    const { kho } = taoKhoGia({ [TEN_COOKIE]: "jwt-het-han" })
    datPhanHoi([{ status: 401, body: { message: "Unauthorized" } }])

    const phien = taoPhien(async () => kho)
    expect(await phien.daDangNhap()).toBe(false)
  })

  it("CÓ cookie và máy chủ trả hồ sơ → true", async () => {
    const { kho } = taoKhoGia({ [TEN_COOKIE]: "jwt-tot" })
    datPhanHoi([{ status: 200, body: { customer: { id: "cus_1", email: "a@b.test" } } }])

    const phien = taoPhien(async () => kho)
    expect(await phien.daDangNhap()).toBe(true)
  })

  it("có HỎI máy chủ chứ không chỉ đọc cookie", async () => {
    const { kho } = taoKhoGia({ [TEN_COOKIE]: "jwt" })
    let soLanGoiMang = 0
    globalThis.fetch = (async () => {
      soLanGoiMang++
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ customer: { id: "c", email: "a@b" } }),
      } as any
    }) as any

    const phien = taoPhien(async () => kho)
    await phien.daDangNhap()

    expect(soLanGoiMang).toBe(1)
  })
})

describe("layKhachHang", () => {
  it("trả hồ sơ khi phiên còn hiệu lực", async () => {
    const { kho } = taoKhoGia({ [TEN_COOKIE]: "jwt" })
    datPhanHoi([{ status: 200, body: { customer: { id: "cus_9", email: "sy@vphold.test" } } }])

    const phien = taoPhien(async () => kho)
    expect(await phien.layKhachHang()).toEqual({ id: "cus_9", email: "sy@vphold.test" })
  })

  it("không có cookie thì trả null", async () => {
    const { kho } = taoKhoGia()
    const phien = taoPhien(async () => kho)
    expect(await phien.layKhachHang()).toBeNull()
  })
})
