/**
 * ═══════════════════════════════════════════════════════════════════════
 *  XÁC THỰC KHÁCH HÀNG — GÓI DÙNG CHUNG CHO MỌI STOREFRONT
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Trước khi gộp, ba storefront giữ ba bản sao 229 dòng y hệt nhau. Một lỗi
 * bảo mật phải vá ba lần — và chắc chắn có lần quên.
 *
 * ⚠️ Gói này KHÔNG nhập bất kỳ thứ gì ngoài chuẩn (không `next`, không
 * `server-only`). Đó là ràng buộc có chủ ý: `packages/` nằm ngoài mọi app nên
 * không có `node_modules` riêng, nhập gói ngoài vào là `tsc` gãy ngay.
 *
 * Bố cục:
 *   loi.ts   — dịch thông điệp lỗi Medusa sang tiếng Việt (thuần tuý)
 *   api.ts   — gọi Medusa, trả token (kiểm thử bằng fetch giả)
 *   phien.ts — quy tắc phiên, nhận kho cookie do app tiêm vào
 *   index.ts — tệp này, gom lại một chỗ để app nhập cho gọn
 *
 * Cách dùng ở mỗi app — xem `src/lib/khach-hang.ts` của bất kỳ storefront nào.
 * ══════════════════════════════════════════════════════════════════════
 */

export { dichLoi } from "./loi"

export {
  goiDangNhap,
  goiDangKy,
  goiLayHoSo,
  type KhachHang,
  type KetQuaXacThuc,
} from "./api"

export {
  taoPhien,
  TEN_COOKIE,
  HAN_COOKIE_GIAY,
  type Phien,
  type KetQua,
  type KhoCookiePhien,
} from "./phien"
