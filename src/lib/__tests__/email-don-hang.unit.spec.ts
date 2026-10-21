import { xoaCacheCaiDat } from "../lay-cai-dat"
import {
  cauHinhSmtpTuCaiDat,
  docCauHinhSmtp,
  dungNoiDungEmail,
  guiEmailXacNhanDon,
  laEmailThat,
  type CauHinhSmtp,
  type DonHangEmail,
} from "../email-don-hang"

const SMTP: CauHinhSmtp = { host: "smtp.test", port: 587, user: "u@test", pass: "p", from: "shop@test" }

const DON: DonHangEmail = {
  id: "order_1",
  display_id: 12,
  email: "khach@example.com",
  total: 910000,
  items: [
    { title: "Stepping Stone Shiraz 2024", quantity: 2, unit_price: 385000 },
    { title: "Altus <b>Riesling</b>", quantity: 1, unit_price: 140000 },
  ],
  shipping_address: {
    first_name: "An",
    last_name: "Nguyễn",
    phone: "0912345678",
    address_1: "1 Lê Lợi",
    city: "Quận 1",
    province: "TP.HCM",
  },
}

const khongLog = () => undefined

describe("laEmailThat", () => {
  it("nhận email hợp lệ", () => {
    expect(laEmailThat("khach@example.com")).toBe(true)
  })
  it.each(["", "   ", null, undefined, "khong-co-a-cong", "0912345678@khach.local", "A@KHACH.LOCAL"])(
    "từ chối %p",
    (v) => {
      expect(laEmailThat(v)).toBe(false)
    }
  )
})

describe("cauHinhSmtpTuCaiDat", () => {
  it("thiếu user hoặc pass thì trả null", () => {
    expect(cauHinhSmtpTuCaiDat({ smtp_user: "a" })).toBeNull()
    expect(cauHinhSmtpTuCaiDat({ smtp_pass: "b" })).toBeNull()
    expect(cauHinhSmtpTuCaiDat({})).toBeNull()
  })
  it("có mặc định cho host, port, from", () => {
    expect(cauHinhSmtpTuCaiDat({ smtp_user: "a@x", smtp_pass: "b" })).toEqual({
      host: "smtp.gmail.com",
      port: 587,
      user: "a@x",
      pass: "b",
      from: "a@x",
    })
  })
  it("dùng đúng giá trị đã cấu hình", () => {
    expect(
      cauHinhSmtpTuCaiDat({ smtp_host: "mail.x", smtp_port: "465", smtp_user: "u", smtp_pass: "p", smtp_from: "Shop <s@x>" })
    ).toEqual({ host: "mail.x", port: 465, user: "u", pass: "p", from: "Shop <s@x>" })
  })
})

describe("docCauHinhSmtp (đọc từ module cài đặt, không đọc env)", () => {
  beforeEach(() => xoaCacheCaiDat())
  afterEach(() => {
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASS
  })
  it("đọc smtp_* qua container và bỏ qua biến môi trường SMTP_*", async () => {
    process.env.SMTP_USER = "tu-env"
    process.env.SMTP_PASS = "tu-env"
    const scope = {
      resolve: () => ({ layNhieu: async () => ({ smtp_user: "db@x", smtp_pass: "mk", smtp_host: "h", smtp_port: "25" }) }),
    }
    expect(await docCauHinhSmtp(scope)).toEqual({ host: "h", port: 25, user: "db@x", pass: "mk", from: "db@x" })
  })
  it("DB chưa có smtp thì null dù env có", async () => {
    process.env.SMTP_USER = "tu-env"
    process.env.SMTP_PASS = "tu-env"
    expect(await docCauHinhSmtp({ resolve: () => ({ layNhieu: async () => ({}) }) })).toBeNull()
  })
})

describe("dungNoiDungEmail", () => {
  it("chân thư hiện hotline truyền vào (lấy từ cấu hình chatbot), không có thì bỏ đoạn gọi", () => {
    expect(dungNoiDungEmail(DON, "", "1900 1234").html).toContain("1900 1234")
    expect(dungNoiDungEmail(DON, "").html).not.toContain("hoặc gọi")
  })

  const nd = dungNoiDungEmail(DON, "http://localhost:8900/")

  it("tiêu đề có mã đơn dạng CW + display_id khi chưa có custom_display_id", () => {
    expect(nd.subject).toContain("CW12")
    expect(nd.subject).not.toContain("#")
  })
  it("ưu tiên custom_display_id, và link theo dõi dùng đúng mã đó", () => {
    const x = dungNoiDungEmail({ ...DON, custom_display_id: "CW100001" }, "http://localhost:8900")
    expect(x.subject).toContain("CW100001")
    expect(x.html).toContain("theo-doi-don-hang?ma=CW100001")
    expect(x.text).toContain("Mã đơn hàng: CW100001")
  })
  it("thiếu cả hai mã thì dùng id", () => {
    expect(dungNoiDungEmail({ ...DON, display_id: null }, "").subject).toContain("order_1")
  })
  it("tính tiền theo đồng, không chia 100", () => {
    expect(nd.text).toContain("770.000")
    expect(nd.text).toContain("910.000")
  })
  it("có địa chỉ và link theo dõi chuẩn hóa dấu /", () => {
    expect(nd.text).toContain("1 Lê Lợi, Quận 1, TP.HCM")
    expect(nd.html).toContain("http://localhost:8900/theo-doi-don-hang?ma=CW12")
  })
  it("thoát HTML trong tên sản phẩm", () => {
    expect(nd.html).not.toContain("<b>Riesling</b>")
    expect(nd.html).toContain("&lt;b&gt;Riesling&lt;/b&gt;")
  })
  it("không có link khi thiếu URL cửa hàng", () => {
    expect(dungNoiDungEmail(DON, "").html).not.toContain("theo-doi-don-hang")
  })
  it("là tài liệu HTML đầy đủ, có thương hiệu và nút theo dõi", () => {
    expect(nd.html.startsWith("<!DOCTYPE html>")).toBe(true)
    expect(nd.html).toContain("C.W. WINES")
    expect(nd.html).toContain("Theo dõi đơn hàng")
  })
  it("chỉ nhận ảnh http(s), chặn javascript: và data:", () => {
    const html = dungNoiDungEmail(
      {
        ...DON,
        items: [
          { title: "A", quantity: 1, unit_price: 1000, thumbnail: "https://cdn.test/a.jpg" },
          { title: "B", quantity: 1, unit_price: 1000, thumbnail: "javascript:alert(1)" },
          { title: "C", quantity: 1, unit_price: 1000, thumbnail: "data:image/png;base64,AAAA" },
        ],
      },
      ""
    ).html
    expect(html).toContain('src="https://cdn.test/a.jpg"')
    expect(html).not.toContain("javascript:")
    expect(html).not.toContain("data:image")
  })
  it("ghi chú thanh toán theo phương thức", () => {
    const cod = dungNoiDungEmail({ ...DON, metadata: { phuong_thuc_thanh_toan: "cod" } }, "")
    const ck = dungNoiDungEmail({ ...DON, metadata: { phuong_thuc_thanh_toan: "chuyen-khoan" } }, "")
    expect(cod.html).toContain("Thanh toán khi nhận hàng (COD)")
    expect(ck.html).toContain("Chuyển khoản ngân hàng")
    expect(ck.html).toContain("hoàn tất chuyển khoản")
    expect(dungNoiDungEmail(DON, "").html).not.toContain("Thanh toán:")
  })
  it("thoát HTML ở tên người nhận", () => {
    const html = dungNoiDungEmail(
      { ...DON, shipping_address: { first_name: "<script>x</script>", last_name: "" } },
      ""
    ).html
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })
})

describe("guiEmailXacNhanDon", () => {
  it("gửi tới đúng người nhận khi đủ điều kiện", async () => {
    const sendMail = jest.fn().mockResolvedValue({})
    const kq = await guiEmailXacNhanDon(DON, {
      smtp: SMTP,
      urlCuaHang: "http://localhost:8900",
      taoTransport: () => ({ sendMail }),
      ghiLog: khongLog,
    })
    expect(kq).toBe("da_gui")
    expect(sendMail).toHaveBeenCalledTimes(1)
    expect(sendMail.mock.calls[0][0]).toMatchObject({ from: "shop@test", to: "khach@example.com" })
  })

  it("bỏ qua email giả @khach.local, không tạo transport", async () => {
    const taoTransport = jest.fn()
    const kq = await guiEmailXacNhanDon(
      { ...DON, email: "0912345678@khach.local" },
      { smtp: SMTP, taoTransport, ghiLog: khongLog }
    )
    expect(kq).toBe("bo_qua")
    expect(taoTransport).not.toHaveBeenCalled()
  })

  it("bỏ qua khi chưa cấu hình SMTP", async () => {
    const taoTransport = jest.fn()
    const kq = await guiEmailXacNhanDon(DON, { smtp: null, taoTransport, ghiLog: khongLog })
    expect(kq).toBe("bo_qua")
    expect(taoTransport).not.toHaveBeenCalled()
  })

  it("SMTP lỗi thì trả 'loi' chứ không ném ra", async () => {
    const kq = await guiEmailXacNhanDon(DON, {
      smtp: SMTP,
      taoTransport: () => ({ sendMail: jest.fn().mockRejectedValue(new Error("535 sai mật khẩu")) }),
      ghiLog: khongLog,
    })
    expect(kq).toBe("loi")
  })
})
