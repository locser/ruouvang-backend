import {
  dungLienKetDatLai,
  dungNoiDungEmailDatLai,
  guiEmailDatLaiMatKhau,
} from "../email-dat-lai-mat-khau"
import type { CauHinhSmtp } from "../email-don-hang"

const SMTP: CauHinhSmtp = { host: "smtp.test", port: 587, user: "u@test", pass: "p", from: "shop@test" }
const TOKEN = "eyJhbGciOi.payload+/=.chu-ky"
const khongLog = () => undefined

describe("dungLienKetDatLai", () => {
  it("bỏ dấu / cuối và mã hoá token", () => {
    const l = dungLienKetDatLai("http://localhost:8900/", TOKEN)
    expect(l.startsWith("http://localhost:8900/dat-lai-mat-khau?token=")).toBe(true)
    expect(l).toContain(encodeURIComponent(TOKEN))
    expect(l).not.toContain("+/=")
  })
})

describe("dungNoiDungEmailDatLai", () => {
  const lk = "http://localhost:8900/dat-lai-mat-khau?token=abc"
  const nd = dungNoiDungEmailDatLai(lk)

  it("có tiêu đề, link ở cả bản text lẫn HTML, và lời dặn bỏ qua nếu không yêu cầu", () => {
    expect(nd.subject).toContain("Đặt lại mật khẩu")
    expect(nd.text).toContain(lk)
    expect(nd.html).toContain(`href="${lk}"`)
    expect(nd.text).toContain("bỏ qua email này")
    expect(nd.html.startsWith("<!DOCTYPE html>")).toBe(true)
  })

  it("thoát HTML trong link để không chèn được thuộc tính", () => {
    const x = dungNoiDungEmailDatLai('http://x/?t="><script>1</script>')
    expect(x.html).not.toContain("<script>")
    expect(x.html).toContain("&quot;&gt;&lt;script&gt;")
  })
})

describe("guiEmailDatLaiMatKhau", () => {
  it("gửi tới đúng người, link chứa token", async () => {
    const sendMail = jest.fn().mockResolvedValue({})
    const kq = await guiEmailDatLaiMatKhau(
      { email: "khach@example.com", token: TOKEN },
      { smtp: SMTP, urlCuaHang: "http://localhost:8900", taoTransport: () => ({ sendMail }), ghiLog: khongLog }
    )
    expect(kq).toBe("da_gui")
    const goi = sendMail.mock.calls[0][0]
    expect(goi).toMatchObject({ from: "shop@test", to: "khach@example.com" })
    expect(goi.text).toContain(encodeURIComponent(TOKEN))
  })

  it("bỏ qua khi email giả/không hợp lệ hoặc thiếu token", async () => {
    const taoTransport = jest.fn()
    for (const du of [
      { email: "0912345678@khach.local", token: TOKEN },
      { email: "khong-phai-email", token: TOKEN },
      { email: "khach@example.com", token: "" },
    ]) {
      expect(await guiEmailDatLaiMatKhau(du, { smtp: SMTP, urlCuaHang: "http://x", taoTransport, ghiLog: khongLog })).toBe("bo_qua")
    }
    expect(taoTransport).not.toHaveBeenCalled()
  })

  it("bỏ qua khi thiếu SMTP hoặc địa chỉ storefront", async () => {
    const taoTransport = jest.fn()
    const du = { email: "khach@example.com", token: TOKEN }
    expect(await guiEmailDatLaiMatKhau(du, { smtp: null, urlCuaHang: "http://x", taoTransport, ghiLog: khongLog })).toBe("bo_qua")
    expect(await guiEmailDatLaiMatKhau(du, { smtp: SMTP, urlCuaHang: "", taoTransport, ghiLog: khongLog })).toBe("bo_qua")
    expect(taoTransport).not.toHaveBeenCalled()
  })

  it("SMTP lỗi thì trả 'loi', không ném, và KHÔNG ghi token vào log", async () => {
    const log: string[] = []
    const kq = await guiEmailDatLaiMatKhau(
      { email: "khach@example.com", token: TOKEN },
      {
        smtp: SMTP,
        urlCuaHang: "http://x",
        taoTransport: () => ({ sendMail: jest.fn().mockRejectedValue(new Error("535 sai mật khẩu")) }),
        ghiLog: (_m, tb) => log.push(tb),
      }
    )
    expect(kq).toBe("loi")
    expect(log.join("\n")).not.toContain(TOKEN)
    expect(log.join("\n")).not.toContain(encodeURIComponent(TOKEN))
  })

  it("lần gửi thành công cũng không ghi token vào log", async () => {
    const log: string[] = []
    await guiEmailDatLaiMatKhau(
      { email: "khach@example.com", token: TOKEN },
      { smtp: SMTP, urlCuaHang: "http://x", taoTransport: () => ({ sendMail: jest.fn().mockResolvedValue({}) }), ghiLog: (_m, tb) => log.push(tb) }
    )
    expect(log.join("\n")).not.toContain("eyJhbGciOi")
  })
})
