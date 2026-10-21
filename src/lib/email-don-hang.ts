import nodemailer from "nodemailer"
import { layCaiDat, type PhamViResolve } from "./lay-cai-dat"

/**
 * Email xác nhận đơn hàng gửi cho khách khi có sự kiện `order.placed`.
 *
 * Nguyên tắc: gửi mail là việc PHỤ. Mọi lỗi (thiếu SMTP, SMTP sai, địa chỉ hỏng)
 * chỉ trả về kết quả `loi`/`bo_qua` và ghi log, TUYỆT ĐỐI không ném ra ngoài —
 * vì subscriber `order.placed` còn phải ghi `ai_outbox` để tạo vận đơn, đơn hàng
 * không được hỏng chỉ vì mail không đi được.
 */

export type KetQuaGuiMail = "da_gui" | "bo_qua" | "loi"

export interface DonHangEmail {
  id: string
  display_id?: number | string | null
  custom_display_id?: string | null
  email?: string | null
  total?: number | string | null
  currency_code?: string | null
  metadata?: Record<string, unknown> | null
  items?: Array<{
    title?: string | null
    thumbnail?: string | null
    quantity?: number | string | null
    unit_price?: number | string | null
  }> | null
  shipping_address?: {
    first_name?: string | null
    last_name?: string | null
    phone?: string | null
    address_1?: string | null
    city?: string | null
    province?: string | null
  } | null
}

export interface CauHinhSmtp {
  host: string
  port: number
  user: string
  pass: string
  from: string
}

export interface NoiDungEmail {
  subject: string
  text: string
  html: string
}

/** Bảng màu thương hiệu, lấy từ storefront (`tailwind.config.js`). */
const MAU = {
  ruou: "#6B1E2E", // burgundy: tiêu đề, nút, tổng tiền
  dong: "#80612F", // copper-ink: nhãn nhỏ (đạt tương phản chữ nhỏ trên nền sáng)
  chu: "#1C1A19",
  chuPhu: "#5C5652",
  nen: "#F7F3EC", // ivory
  nenPhu: "#F1E6E4",
  vien: "#E6DED3",
} as const

/** Chỉ cho ảnh http(s): tránh `javascript:` hay `data:` lọt vào thuộc tính src. */
function laUrlAnhHopLe(u: unknown): u is string {
  return typeof u === "string" && /^https?:\/\//i.test(u.trim())
}

/** Storefront ghi `{sdt}@khach.local` khi khách không nhập email (dat-hang/route.ts). */
const MIEN_EMAIL_GIA = "@khach.local"

export function laEmailThat(email: unknown): email is string {
  if (typeof email !== "string") return false
  const e = email.trim().toLowerCase()
  if (!e || e.endsWith(MIEN_EMAIL_GIA)) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

/**
 * Dựng cấu hình SMTP từ các khoá cài đặt (smtp_host/port/user/pass/from).
 * Thiếu user hoặc pass thì trả null. Không còn đọc biến môi trường SMTP_*.
 */
export function cauHinhSmtpTuCaiDat(cd: {
  smtp_host?: string
  smtp_port?: string
  smtp_user?: string
  smtp_pass?: string
  smtp_from?: string
}): CauHinhSmtp | null {
  const user = (cd.smtp_user ?? "").trim()
  const pass = (cd.smtp_pass ?? "").trim()
  if (!user || !pass) return null
  const host = (cd.smtp_host ?? "").trim() || "smtp.gmail.com"
  const port = Number(cd.smtp_port) || 587
  const from = (cd.smtp_from ?? "").trim() || user
  return { host, port, user, pass, from }
}

/** Đọc cấu hình SMTP từ module cài đặt qua container (có cache 30s). */
export async function docCauHinhSmtp(scope: PhamViResolve): Promise<CauHinhSmtp | null> {
  return cauHinhSmtpTuCaiDat(await layCaiDat(scope))
}

function thoatHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** VND là tiền không có phần lẻ: số trong đơn đã là đồng, KHÔNG chia 100. */
function dinhDangTien(so: unknown): string {
  const n = Number(so)
  if (!Number.isFinite(n)) return "0đ"
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(n))}đ`
}

function gomDiaChi(a: NonNullable<DonHangEmail["shipping_address"]>): string {
  return [a.address_1, a.city, a.province]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ")
}

export function dungNoiDungEmail(
  don: DonHangEmail,
  urlCuaHang?: string,
  hotline?: string
): NoiDungEmail {
  // Cùng quy tắc với storefront (`maDonHienThi`): custom_display_id → CW+display_id → id.
  const ma = don.custom_display_id
    ? String(don.custom_display_id)
    : don.display_id != null && don.display_id !== ""
      ? `CW${don.display_id}`
      : String(don.id)
  const items = don.items ?? []
  const addr = don.shipping_address ?? {}
  const tenNguoiNhan = `${addr.first_name ?? ""} ${addr.last_name ?? ""}`.trim()
  const diaChi = gomDiaChi(addr)
  const base = (urlCuaHang ?? "").trim().replace(/\/+$/, "")
  const lienKet = base ? `${base}/theo-doi-don-hang?ma=${encodeURIComponent(ma)}` : ""

  const subject = `Xác nhận đơn hàng ${ma} - C.W. Wines`

  const dongText = items.map(
    (it) =>
      `- ${it.title ?? ""} x ${it.quantity ?? 1}: ${dinhDangTien(
        Number(it.unit_price ?? 0) * Number(it.quantity ?? 1)
      )}`
  )
  const text = [
    `Cảm ơn ${tenNguoiNhan || "anh/chị"} đã đặt hàng tại C.W. Wines.`,
    `Mã đơn hàng: ${ma}`,
    "",
    ...dongText,
    "",
    `Tổng cộng: ${dinhDangTien(don.total)}`,
    tenNguoiNhan ? `Người nhận: ${tenNguoiNhan}${addr.phone ? ` - ${addr.phone}` : ""}` : "",
    diaChi ? `Địa chỉ giao hàng: ${diaChi}` : "",
    lienKet ? `\nTheo dõi đơn hàng: ${lienKet}` : "",
  ]
    .filter((l, i, arr) => l !== "" || arr[i - 1] !== "")
    .join("\n")

  const phuongThuc = don.metadata?.phuong_thuc_thanh_toan
  const nhanThanhToan =
    phuongThuc === "cod"
      ? "Thanh toán khi nhận hàng (COD)"
      : phuongThuc === "chuyen-khoan"
        ? "Chuyển khoản ngân hàng"
        : ""
  const ghiChuThanhToan =
    phuongThuc === "chuyen-khoan"
      ? "Vui lòng hoàn tất chuyển khoản theo hướng dẫn tại trang theo dõi đơn hàng để chúng tôi xử lý đơn sớm nhất."
      : phuongThuc === "cod"
        ? "Bạn thanh toán trực tiếp cho nhân viên giao hàng khi nhận được sản phẩm."
        : ""

  // Bố cục dạng bảng + style inline: cách duy nhất chạy đều trên Gmail, Outlook và
  // Apple Mail (các client này bỏ <style> hoặc không hiểu flex/grid).
  const dongHtml = items
    .map((it, i) => {
      const sl = Number(it.quantity ?? 1)
      const donGia = Number(it.unit_price ?? 0)
      const anh = laUrlAnhHopLe(it.thumbnail)
        ? `<img src="${thoatHtml(it.thumbnail)}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid ${MAU.vien}">`
        : `<div style="width:56px;height:56px;border-radius:6px;background:${MAU.nenPhu}"></div>`
      return (
        `<tr>` +
        `<td width="72" valign="top" style="padding:14px 0${i === 0 ? "" : ";border-top:1px solid " + MAU.vien}">${anh}</td>` +
        `<td valign="top" style="padding:14px 12px${i === 0 ? "" : ";border-top:1px solid " + MAU.vien};font-size:14px;line-height:20px;color:${MAU.chu}">` +
        `<strong style="font-weight:600">${thoatHtml(it.title)}</strong><br>` +
        `<span style="color:${MAU.chuPhu};font-size:13px">${thoatHtml(dinhDangTien(donGia))} &times; ${thoatHtml(sl)}</span></td>` +
        `<td valign="top" align="right" style="padding:14px 0${i === 0 ? "" : ";border-top:1px solid " + MAU.vien};font-size:14px;line-height:20px;color:${MAU.chu};white-space:nowrap"><strong style="font-weight:600">${thoatHtml(dinhDangTien(donGia * sl))}</strong></td>` +
        `</tr>`
      )
    })
    .join("")

  const khoiNhan =
    tenNguoiNhan || diaChi
      ? `<tr><td style="padding:0 32px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MAU.nenPhu};border-radius:8px"><tr><td style="padding:16px 20px;font-size:14px;line-height:22px;color:${MAU.chu}">` +
        `<div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${MAU.dong};font-weight:700;margin-bottom:6px">Giao đến</div>` +
        (tenNguoiNhan
          ? `<strong style="font-weight:600">${thoatHtml(tenNguoiNhan)}</strong>${addr.phone ? ` &middot; ${thoatHtml(addr.phone)}` : ""}<br>`
          : "") +
        (diaChi ? `${thoatHtml(diaChi)}` : "") +
        (nhanThanhToan
          ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid ${MAU.vien}"><span style="color:${MAU.chuPhu}">Thanh toán:</span> <strong style="font-weight:600">${thoatHtml(nhanThanhToan)}</strong></div>`
          : "") +
        `</td></tr></table></td></tr>`
      : ""

  const nutTheoDoi = lienKet
    ? `<tr><td align="center" style="padding:24px 32px 8px">` +
      `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="${MAU.ruou}" style="border-radius:6px">` +
      `<a href="${thoatHtml(lienKet)}" style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:700;letter-spacing:.5px;color:#ffffff;text-decoration:none;border-radius:6px;background:${MAU.ruou}">Theo dõi đơn hàng</a>` +
      `</td></tr></table></td></tr>`
    : ""

  const lienHe = (hotline ?? "").trim()

  const html =
    `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light"><title>${thoatHtml(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${MAU.nen};-webkit-text-size-adjust:100%">` +
    // Dòng xem trước hiện cạnh tiêu đề trong hộp thư.
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">Đơn hàng ${thoatHtml(ma)} đã được ghi nhận. Tổng cộng ${thoatHtml(dinhDangTien(don.total))}.</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MAU.nen}"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;font-family:Helvetica,Arial,sans-serif">` +
    // Đầu thư
    `<tr><td align="center" bgcolor="${MAU.ruou}" style="background:${MAU.ruou};padding:28px 32px 22px">` +
    `<div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;letter-spacing:4px;color:#ffffff;font-weight:400">C.W. WINES</div>` +
    `<div style="width:48px;height:2px;background:${MAU.dong};margin:12px auto 0"></div></td></tr>` +
    // Lời chào + mã đơn
    `<tr><td style="padding:32px 32px 8px">` +
    `<h1 style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:32px;font-weight:400;color:${MAU.chu}">Cảm ơn ${thoatHtml(tenNguoiNhan || "anh/chị")} đã đặt hàng</h1>` +
    `<p style="margin:0;font-size:15px;line-height:24px;color:${MAU.chuPhu}">Chúng tôi đã nhận được đơn hàng của bạn và sẽ liên hệ xác nhận trong thời gian sớm nhất.</p></td></tr>` +
    `<tr><td style="padding:16px 32px 8px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="background:${MAU.nenPhu};border-radius:6px;padding:10px 16px;font-size:13px;color:${MAU.chuPhu}">Mã đơn hàng&nbsp;&nbsp;<strong style="font-size:16px;color:${MAU.ruou};letter-spacing:.5px">${thoatHtml(ma)}</strong></td>` +
    `</tr></table></td></tr>` +
    // Danh sách món
    `<tr><td style="padding:16px 32px 0"><div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${MAU.dong};font-weight:700;padding-bottom:6px;border-bottom:2px solid ${MAU.ruou}">Chi tiết đơn hàng</div></td></tr>` +
    `<tr><td style="padding:0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${dongHtml}</table></td></tr>` +
    // Tổng tiền
    `<tr><td style="padding:8px 32px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid ${MAU.ruou}"><tr>` +
    `<td style="padding-top:14px;font-size:15px;color:${MAU.chu}"><strong style="font-weight:600">Tổng cộng</strong></td>` +
    `<td align="right" style="padding-top:14px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${MAU.ruou}"><strong>${thoatHtml(dinhDangTien(don.total))}</strong></td>` +
    `</tr></table></td></tr>` +
    khoiNhan +
    (ghiChuThanhToan
      ? `<tr><td style="padding:12px 32px 0;font-size:13px;line-height:20px;color:${MAU.chuPhu}">${thoatHtml(ghiChuThanhToan)}</td></tr>`
      : "") +
    nutTheoDoi +
    // Chân thư
    `<tr><td style="padding:28px 32px 28px"><div style="border-top:1px solid ${MAU.vien};padding-top:18px;font-size:12px;line-height:19px;color:${MAU.chuPhu};text-align:center">` +
    `Đây là email tự động từ C.W. Wines. Nếu cần hỗ trợ, hãy trả lời email này${lienHe ? ` hoặc gọi <strong style="color:${MAU.chu}">${thoatHtml(lienHe)}</strong>` : ""}.<br>` +
    `<span style="color:${MAU.dong}">Uống có trách nhiệm. Không bán cho người dưới 18 tuổi.</span></div></td></tr>` +
    `</table></td></tr></table></body></html>`

  return { subject, text, html }
}

export interface PhuThuocGuiMail {
  /** Cấu hình SMTP (lấy bằng `docCauHinhSmtp(container)`). Không truyền/null = chưa cấu hình, bỏ qua gửi. */
  smtp?: CauHinhSmtp | null
  urlCuaHang?: string
  /** Hotline hiển thị ở chân thư (lấy từ cài đặt cửa hàng); không truyền thì bỏ đoạn "hoặc gọi". */
  hotline?: string
  /** Chỉ dùng trong test: thay cho nodemailer thật. */
  taoTransport?: (cfg: CauHinhSmtp) => { sendMail: (opts: Record<string, unknown>) => Promise<unknown> }
  ghiLog?: (muc: "info" | "warn", thongBao: string) => void
}

export async function guiEmailXacNhanDon(
  don: DonHangEmail,
  phuThuoc: PhuThuocGuiMail = {}
): Promise<KetQuaGuiMail> {
  const ghiLog = phuThuoc.ghiLog ?? ((muc, tb) => console[muc === "warn" ? "warn" : "log"](tb))

  try {
    if (!laEmailThat(don.email)) {
      ghiLog("info", `[email-don] bỏ qua đơn ${don.id}: không có email thật của khách`)
      return "bo_qua"
    }

    const smtp = phuThuoc.smtp ?? null
    if (!smtp) {
      ghiLog("warn", `[email-don] bỏ qua đơn ${don.id}: chưa cấu hình SMTP (smtp_user/smtp_pass trong Cấu hình cửa hàng)`)
      return "bo_qua"
    }

    const urlCuaHang =
      phuThuoc.urlCuaHang ??
      process.env.CONFIG_SITE_URL ??
      ""
    const nd = dungNoiDungEmail(don, urlCuaHang, phuThuoc.hotline)

    const transport = phuThuoc.taoTransport
      ? phuThuoc.taoTransport(smtp)
      : nodemailer.createTransport({
          host: smtp.host,
          port: smtp.port,
          secure: smtp.port === 465,
          auth: { user: smtp.user, pass: smtp.pass },
        })

    await transport.sendMail({
      from: smtp.from,
      to: don.email!.trim(),
      subject: nd.subject,
      text: nd.text,
      html: nd.html,
    })
    ghiLog("info", `[email-don] đã gửi xác nhận đơn ${don.id}`)
    return "da_gui"
  } catch (e: any) {
    ghiLog("warn", `[email-don] gửi mail đơn ${don.id} lỗi: ${e?.message ?? e}`)
    return "loi"
  }
}
