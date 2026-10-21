/**
 * ═══════════════════════════════════════════════════════════════════════
 *  QUẢN LÝ PHIÊN ĐĂNG NHẬP — KHÔNG PHỤ THUỘC NEXT
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Toàn bộ quy tắc phiên (đăng nhập, đăng ký, đăng xuất, kiểm tra phiên còn
 * hiệu lực) nằm ở đây. Chỗ CẤT token thì do app tiêm vào qua `KhoCookiePhien`.
 *
 * ⚠️ Vì sao không nhập thẳng `next/headers` ở gói dùng chung:
 * `packages/` nằm ngoài mọi app nên không có `node_modules` riêng. Webpack của
 * Next vẫn phân giải được `next/headers` (site chạy bình thường), nhưng
 * TypeScript thì KHÔNG — `tsc --noEmit` báo TS2307. Nghĩa là gói dùng chung sẽ
 * mãi không kiểm tra kiểu được. Tiêm phụ thuộc vào giải quyết triệt để: gói
 * này thuần tuý, app chỉ cần ~20 dòng nối vào `cookies()` của Next.
 *
 * Lợi ích kèm theo: `daDangNhap()` giờ kiểm thử được bằng kho cookie giả —
 * đúng chỗ đã từng gây vòng lặp chuyển hướng vô tận.
 * ══════════════════════════════════════════════════════════════════════
 */

import { goiDangNhap, goiDangKy, goiLayHoSo, type KhachHang } from "./api"

/** Tên cookie giữ JWT. Đổi được qua biến môi trường nếu hai site chung tên miền. */
export const TEN_COOKIE = process.env.CONFIG_SESSION_COOKIE_NAME || "medusa_jwt"

/** Phiên giữ 7 ngày — đủ dùng, không quá dài để thành rủi ro. */
export const HAN_COOKIE_GIAY = 60 * 60 * 24 * 7

/** Kết quả trả cho form: hoặc thành công, hoặc kèm thông điệp tiếng Việt. */
export type KetQua = { ok: true } | { ok: false; loi: string }

/**
 * Kho cookie do app cung cấp.
 *
 * App phải bảo đảm cookie ghi ra là **httpOnly** — JavaScript phía client không
 * được đọc token, đó là hàng rào chống đánh cắp phiên qua XSS.
 */
export interface KhoCookiePhien {
  doc(ten: string): string | undefined
  ghi(ten: string, giaTri: string, hanGiay: number): void
  xoa(ten: string): void
}

export interface Phien {
  dangNhap(email: string, matKhau: string): Promise<KetQua>
  dangKy(email: string, matKhau: string, ho: string, ten: string): Promise<KetQua>
  dangXuat(): Promise<void>
  layKhachHang(): Promise<KhachHang | null>
  daDangNhap(): Promise<boolean>
}

/**
 * Dựng bộ hàm phiên từ một kho cookie.
 *
 * `layKho` là hàm bất đồng bộ vì `cookies()` của Next 15 trả về Promise.
 */
export function taoPhien(layKho: () => Promise<KhoCookiePhien>): Phien {
  async function dangNhap(email: string, matKhau: string): Promise<KetQua> {
    const kq = await goiDangNhap(email, matKhau)
    if (!kq.ok) return { ok: false, loi: kq.loi }

    const kho = await layKho()
    kho.ghi(TEN_COOKIE, kq.token, HAN_COOKIE_GIAY)
    return { ok: true }
  }

  async function dangKy(
    email: string,
    matKhau: string,
    ho: string,
    ten: string
  ): Promise<KetQua> {
    const kq = await goiDangKy(email, matKhau, ho, ten)
    if (!kq.ok) return { ok: false, loi: kq.loi }

    const kho = await layKho()
    kho.ghi(TEN_COOKIE, kq.token, HAN_COOKIE_GIAY)
    return { ok: true }
  }

  async function dangXuat(): Promise<void> {
    const kho = await layKho()
    kho.xoa(TEN_COOKIE)
  }

  async function layKhachHang(): Promise<KhachHang | null> {
    const kho = await layKho()
    const token = kho.doc(TEN_COOKIE)
    if (!token) return null

    return goiLayHoSo(token)
  }

  /**
   * ⚠️ Cố tình hỏi hẳn máy chủ chứ KHÔNG chỉ kiểm tra cookie có tồn tại.
   *
   * Nếu chỉ xem cookie thì một JWT hết hạn vẫn bị coi là "đã đăng nhập":
   * trang đăng nhập đá sang trang tài khoản, trang tài khoản thấy hồ sơ null
   * lại đá ngược về — VÒNG LẶP VÔ TẬN. Trang bảo vệ và trang đăng nhập BẮT
   * BUỘC dùng chung nguồn sự thật này.
   */
  async function daDangNhap(): Promise<boolean> {
    return (await layKhachHang()) !== null
  }

  return { dangNhap, dangKy, dangXuat, layKhachHang, daDangNhap }
}
