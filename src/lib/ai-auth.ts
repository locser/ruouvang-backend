import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

/**
 * Xác thực dùng chung cho toàn bộ nhánh API /ai/*.
 *
 * FAIL-CLOSED: thiếu cấu hình CONFIG_INTERNAL_SERVICE_KEY = TỪ CHỐI, không phải cho qua.
 *
 * Vì sao tách thành file riêng: trước đây mỗi route tự khai
 *     const CONFIG_INTERNAL_SERVICE_KEY = process.env.CONFIG_INTERNAL_SERVICE_KEY || "REPLACE_WITH_NEW_SECRET";
 * lặp lại ở 15 chỗ. Chuỗi mặc định nằm công khai trong mã nguồn, nghĩa là bất
 * kỳ ai đọc được repo cũng gọi được /ai/chot-don (tạo đơn thật),
 * /ai/payment-info (số tài khoản ngân hàng), /ai/refund-order (hoàn tiền) mà
 * không cần đăng nhập. Khi vá thủ công từng file thì sót 12/15 route.
 * Một chỗ định nghĩa duy nhất = không thể sót nữa.
 *
 * ⚠️ CÁI BẪY khi vá vội: chỉ xoá phần `|| "REPLACE_WITH_NEW_SECRET"` là CHƯA ĐỦ.
 * Khi đó nếu biến môi trường không được đặt thì CONFIG_INTERNAL_SERVICE_KEY là `undefined`,
 * và request không gửi header cũng cho `undefined`, nên phép so sánh
 * `undefined === undefined` trả về TRUE — toàn bộ API mở toang mà không cần
 * bất kỳ header nào. Bắt buộc phải có guard `if (!secret) return false`.
 */

function laySecret(): string | undefined {
  const v = process.env.CONFIG_INTERNAL_SERVICE_KEY;
  return v && v.length > 0 ? v : undefined;
}

/** So sánh không phụ thuộc thời gian, tránh rò rỉ qua đo độ trễ. */
function soSanhAnToan(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let khac = 0;
  for (let i = 0; i < a.length; i++) khac |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return khac === 0;
}

export function checkAuth(req: MedusaRequest): boolean {
  const mongDoi = laySecret();
  if (!mongDoi) {
    console.error("[ai-auth] CONFIG_INTERNAL_SERVICE_KEY chưa cấu hình — từ chối mọi request /ai/*");
    return false;
  }
  const nhanDuoc = req.headers["x-ai-secret-key"];
  if (typeof nhanDuoc !== "string" || nhanDuoc.length === 0) return false;
  return soSanhAnToan(nhanDuoc, mongDoi);
}

/**
 * Tiện dụng cho handler:
 *
 *   if (tuChoiNeuKhongHopLe(req, res)) return;
 *
 * Trả về true nghĩa là ĐÃ gửi 401 và nơi gọi phải return ngay.
 */
export function tuChoiNeuKhongHopLe(req: MedusaRequest, res: MedusaResponse): boolean {
  if (checkAuth(req)) return false;
  res.status(401).json({ error: "Unauthorized: Invalid or missing x-ai-secret-key header" });
  return true;
}
