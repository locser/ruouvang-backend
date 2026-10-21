/**
 * Nhãn gắn vào `metadata` của đơn để nhân viên (và thông báo Telegram) biết đơn đến từ kênh nào
 * và đã thu tiền chưa. Chỉ là thông tin hiển thị: KHÔNG thay đổi trạng thái thanh toán của Medusa
 * (đơn chuyển khoản vẫn là `authorized` cho tới khi nhân viên bấm "Duyệt hoàn thành").
 *
 *   kenh_dat_hang          "website" | "chatbot"
 *   phuong_thuc_thanh_toan "cod" | "chuyen-khoan"
 *   thanh_toan_trang_thai  "cod" | "cho_chuyen_khoan" | "da_thanh_toan"
 */
export const NHAN_DON_CHATBOT = {
  phuong_thuc_thanh_toan: "chuyen-khoan",
  kenh_dat_hang: "chatbot",
  thanh_toan_trang_thai: "cho_chuyen_khoan",
} as const

type Metadata = Record<string, unknown> | null | undefined

/**
 * Kênh đặt hàng. Đơn cũ (trước khi có `kenh_dat_hang`) suy từ `phuong_thuc_thanh_toan`:
 * storefront luôn ghi trường này, chatbot thì không.
 */
export function nhanKenh(metadata: Metadata): "Website" | "Chatbot" {
  const kenh = metadata?.kenh_dat_hang
  if (kenh === "chatbot") return "Chatbot"
  if (kenh === "website") return "Website"
  return metadata?.phuong_thuc_thanh_toan ? "Website" : "Chatbot"
}

/** Dòng trạng thái thanh toán cho thông báo. */
export function nhanThanhToan(metadata: Metadata): string {
  if (metadata?.thanh_toan_trang_thai === "da_thanh_toan") return "✅ Đã nhận tiền"
  if (metadata?.phuong_thuc_thanh_toan === "cod") return "💵 COD, thu tiền khi giao"
  return "🏦 Chuyển khoản, chờ xác nhận tiền"
}
