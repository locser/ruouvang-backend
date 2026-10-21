import nodemailer from "nodemailer"
import { laEmailThat, type CauHinhSmtp, type KetQuaGuiMail } from "./email-don-hang"

/**
 * Email đặt lại mật khẩu cho khách, gửi khi Medusa phát sự kiện `auth.password_reset`.
 *
 * ⚠️ Token là bí mật dùng một lần: KHÔNG ghi vào log, kể cả khi gửi lỗi. Nguyên tắc như
 * mail đơn hàng: lỗi chỉ trả `loi`/`bo_qua`, không ném ra ngoài.
 */

export interface DuLieuDatLaiMatKhau {
  /** Email của tài khoản (Medusa đặt vào `entity_id`). */
  email: string
  /** Token đặt lại mật khẩu của Medusa. */
  token: string
}

export interface NoiDungEmailMatKhau {
  subject: string
  text: string
  html: string
}

const MAU = { ruou: "#6B1E2E", dong: "#80612F", chu: "#1C1A19", chuPhu: "#5C5652", nen: "#F7F3EC", vien: "#E6DED3" } as const

function thoatHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** Link đặt lại mật khẩu trên storefront. Token được mã hoá URL. */
export function dungLienKetDatLai(urlCuaHang: string, token: string): string {
  const base = (urlCuaHang ?? "").trim().replace(/\/+$/, "")
  return `${base}/dat-lai-mat-khau?token=${encodeURIComponent(token)}`
}

export function dungNoiDungEmailDatLai(lienKet: string): NoiDungEmailMatKhau {
  const subject = "Đặt lại mật khẩu tài khoản C.W. Wines"
  const text = [
    "Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản C.W. Wines của bạn.",
    "",
    `Đặt mật khẩu mới: ${lienKet}`,
    "",
    "Liên kết chỉ dùng được một lần và hết hạn sau 15 phút.",
    "Nếu bạn không yêu cầu, hãy bỏ qua email này; mật khẩu của bạn không thay đổi.",
  ].join("\n")

  const html =
    `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">` +
    `<title>${thoatHtml(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${MAU.nen}">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">Bấm vào nút để đặt mật khẩu mới cho tài khoản của bạn.</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MAU.nen}"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;font-family:Helvetica,Arial,sans-serif">` +
    `<tr><td align="center" bgcolor="${MAU.ruou}" style="background:${MAU.ruou};padding:28px 32px 22px">` +
    `<div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;letter-spacing:4px;color:#ffffff">C.W. WINES</div>` +
    `<div style="width:48px;height:2px;background:#B08D57;margin:12px auto 0"></div></td></tr>` +
    `<tr><td style="padding:32px 32px 8px">` +
    `<h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:32px;font-weight:400;color:${MAU.chu}">Đặt lại mật khẩu</h1>` +
    `<p style="margin:0;font-size:15px;line-height:24px;color:${MAU.chuPhu}">Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản C.W. Wines của bạn. Bấm nút bên dưới để tạo mật khẩu mới.</p></td></tr>` +
    `<tr><td align="center" style="padding:24px 32px 8px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="${MAU.ruou}" style="border-radius:6px">` +
    `<a href="${thoatHtml(lienKet)}" style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:700;letter-spacing:.5px;color:#ffffff;text-decoration:none;border-radius:6px;background:${MAU.ruou}">Đặt mật khẩu mới</a>` +
    `</td></tr></table></td></tr>` +
    `<tr><td style="padding:16px 32px 0;font-size:12px;line-height:19px;color:${MAU.chuPhu}">Nếu nút không bấm được, sao chép liên kết này vào trình duyệt:<br>` +
    `<span style="word-break:break-all;color:${MAU.dong}">${thoatHtml(lienKet)}</span></td></tr>` +
    `<tr><td style="padding:24px 32px 28px"><div style="border-top:1px solid ${MAU.vien};padding-top:18px;font-size:12px;line-height:19px;color:${MAU.chuPhu};text-align:center">` +
    `Liên kết chỉ dùng được một lần và hết hạn sau 15 phút.<br>Nếu bạn không yêu cầu, hãy bỏ qua email này; mật khẩu của bạn không thay đổi.</div></td></tr>` +
    `</table></td></tr></table></body></html>`

  return { subject, text, html }
}

export interface PhuThuocGuiMatKhau {
  /** Cấu hình SMTP (lấy bằng `docCauHinhSmtp(container)`). Không truyền/null = chưa cấu hình, bỏ qua gửi. */
  smtp?: CauHinhSmtp | null
  urlCuaHang?: string
  /** Chỉ dùng trong test: thay cho nodemailer thật. */
  taoTransport?: (cfg: CauHinhSmtp) => { sendMail: (opts: Record<string, unknown>) => Promise<unknown> }
  ghiLog?: (muc: "info" | "warn", thongBao: string) => void
}

export async function guiEmailDatLaiMatKhau(
  du: DuLieuDatLaiMatKhau,
  phuThuoc: PhuThuocGuiMatKhau = {}
): Promise<KetQuaGuiMail> {
  const ghiLog = phuThuoc.ghiLog ?? ((muc, tb) => console[muc === "warn" ? "warn" : "log"](tb))

  try {
    if (!laEmailThat(du.email) || !du.token) {
      ghiLog("info", "[email-mat-khau] bỏ qua: thiếu email hợp lệ hoặc token")
      return "bo_qua"
    }

    const smtp = phuThuoc.smtp ?? null
    if (!smtp) {
      ghiLog("warn", "[email-mat-khau] bỏ qua: chưa cấu hình SMTP (smtp_user/smtp_pass trong Cấu hình cửa hàng)")
      return "bo_qua"
    }

    const urlCuaHang =
      phuThuoc.urlCuaHang ??
      process.env.CONFIG_SITE_URL ??
      ""
    if (!urlCuaHang) {
      ghiLog("warn", "[email-mat-khau] bỏ qua: không biết địa chỉ storefront (CONFIG_SITE_URL)")
      return "bo_qua"
    }

    const nd = dungNoiDungEmailDatLai(dungLienKetDatLai(urlCuaHang, du.token))
    const transport = phuThuoc.taoTransport
      ? phuThuoc.taoTransport(smtp)
      : nodemailer.createTransport({
          host: smtp.host,
          port: smtp.port,
          secure: smtp.port === 465,
          auth: { user: smtp.user, pass: smtp.pass },
        })

    await transport.sendMail({ from: smtp.from, to: du.email.trim(), subject: nd.subject, text: nd.text, html: nd.html })
    ghiLog("info", "[email-mat-khau] đã gửi email đặt lại mật khẩu")
    return "da_gui"
  } catch (e: any) {
    // Không ghi token; thông điệp lỗi của SMTP không chứa token.
    ghiLog("warn", `[email-mat-khau] gửi mail lỗi: ${e?.message ?? e}`)
    return "loi"
  }
}
