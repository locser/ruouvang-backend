/**
 * ═══════════════════════════════════════════════════════════════════════
 *  XÁC THỰC KHÁCH HÀNG — TẦNG GỌI MEDUSA (không đụng cookie)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Tầng này CHỈ nói chuyện với Medusa: nhận email/mật khẩu, trả về token.
 * Việc cất token vào đâu là chuyện của `index.ts`.
 *
 * Vì sao tách: gộp chung với cookie thì phải nhập `next/headers`, mà mô-đun đó
 * không nạp được ngoài Next — nghĩa là toàn bộ logic xác thực sẽ KHÔNG kiểm
 * thử được. Tách ra thì phần logic khó nhất (luồng đăng ký 3 bước) chạy được
 * dưới Jest chỉ với một `fetch` giả.
 *
 * Luồng Medusa v2 — đã kiểm chứng thực tế trên backend:9000:
 *   Đăng ký:   POST /auth/customer/emailpass/register  → { token }  (actor_id RỖNG)
 *              POST /store/customers (Bearer token)    → { customer }
 *              POST /auth/customer/emailpass           → { token }  (actor_id ĐÚNG)
 *   Đăng nhập: POST /auth/customer/emailpass           → { token }
 *   Hồ sơ:     GET  /store/customers/me (Bearer token)
 *
 * Lưu ý: endpoint /auth/* KHÔNG cần publishable key; /store/* thì CẦN.
 * ══════════════════════════════════════════════════════════════════════
 */

import { dichLoi } from "./loi"

export interface KhachHang {
  id: string
  email: string
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  created_at?: string
}

export type KetQuaXacThuc =
  | { ok: true; token: string }
  | { ok: false; loi: string }

/** Đọc lúc gọi chứ không lúc nạp mô-đun, để bài kiểm thử đặt được biến. */
function cauHinh() {
  return {
    goc: process.env.CONFIG_API_MEDUSA_URL || "http://backend:9000",
    khoa: process.env.CONFIG_PUBLISHABLE_KEY_MEDUSA || "",
  }
}

type KetQuaGoi =
  | { ok: true; du_lieu: any }
  | { ok: false; trangThai: number; loi: string }

async function goi(
  duongDan: string,
  tuyChon: {
    method?: string
    than?: unknown
    token?: string
    /** Endpoint /auth/* không cần publishable key. */
    khongCanKhoa?: boolean
  } = {}
): Promise<KetQuaGoi> {
  const { goc, khoa } = cauHinh()

  if (!tuyChon.khongCanKhoa && !khoa) {
    return {
      ok: false,
      trangThai: 500,
      loi: "Thiếu CONFIG_PUBLISHABLE_KEY_MEDUSA — chưa cấu hình được tài khoản.",
    }
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (!tuyChon.khongCanKhoa) headers["x-publishable-api-key"] = khoa
  if (tuyChon.token) headers["Authorization"] = `Bearer ${tuyChon.token}`

  let res: Response
  try {
    res = await fetch(`${goc}${duongDan}`, {
      method: tuyChon.method ?? "GET",
      headers,
      body: tuyChon.than === undefined ? undefined : JSON.stringify(tuyChon.than),
      // Hồ sơ khách phải luôn là dữ liệu thật — không bao giờ cache.
      cache: "no-store",
    })
  } catch {
    return { ok: false, trangThai: 503, loi: "Không kết nối được máy chủ." }
  }

  const chu = await res.text()
  let d: any = {}
  try {
    d = chu ? JSON.parse(chu) : {}
  } catch {
    d = { message: chu.slice(0, 200) }
  }

  if (!res.ok) {
    return { ok: false, trangThai: res.status, loi: dichLoi(res.status, d?.message || "") }
  }
  return { ok: true, du_lieu: d }
}

/** Đăng nhập bằng email + mật khẩu. Trả token dùng được ngay. */
export async function goiDangNhap(email: string, matKhau: string): Promise<KetQuaXacThuc> {
  const e = email.trim().toLowerCase()
  if (!e || !matKhau) {
    return { ok: false, loi: "Anh/chị nhập đủ email và mật khẩu giúp em." }
  }

  const res = await goi("/auth/customer/emailpass", {
    method: "POST",
    than: { email: e, password: matKhau },
    khongCanKhoa: true,
  })
  if (!res.ok) return { ok: false, loi: res.loi }

  const token: string = res.du_lieu?.token
  if (!token) return { ok: false, loi: "Email hoặc mật khẩu chưa đúng." }

  return { ok: true, token }
}

/**
 * Đăng ký tài khoản mới. BA bước, KHÔNG được rút gọn.
 *
 * ⚠️ Bước 3 (đăng nhập lại) là bắt buộc. Token ở bước 1 có `actor_id` RỖNG —
 * nó mới chỉ chứng minh danh tính đăng nhập, chưa gắn với khách hàng nào. Đem
 * token đó cất vào cookie thì `GET /store/customers/me` trả 401, hàm lấy hồ sơ
 * trả null, trang tài khoản đá về trang đăng nhập — trong khi cookie vẫn còn
 * nên trang đăng nhập lại đá sang trang tài khoản: VÒNG LẶP VÔ TẬN.
 *
 * Lỗi này KHÔNG lộ ra khi thử bằng curl nếu vô tình dùng token của bước 3.
 * Chỉ bấm thật trên trình duyệt mới thấy. Đã trả giá một lần rồi.
 */
export async function goiDangKy(
  email: string,
  matKhau: string,
  ho: string,
  ten: string
): Promise<KetQuaXacThuc> {
  const e = email.trim().toLowerCase()

  if (!e || !e.includes("@")) return { ok: false, loi: "Email chưa hợp lệ." }
  if (matKhau.length < 8) return { ok: false, loi: "Mật khẩu cần tối thiểu 8 ký tự." }

  // Bước 1 — tạo danh tính đăng nhập.
  const dangKyRes = await goi("/auth/customer/emailpass/register", {
    method: "POST",
    than: { email: e, password: matKhau },
    khongCanKhoa: true,
  })
  if (!dangKyRes.ok) return { ok: false, loi: dangKyRes.loi }

  const tokenDangKy: string = dangKyRes.du_lieu?.token
  if (!tokenDangKy) return { ok: false, loi: "Máy chủ không trả về phiên đăng nhập." }

  // Bước 2 — tạo hồ sơ khách hàng.
  const taoRes = await goi("/store/customers", {
    method: "POST",
    than: { email: e, first_name: ho.trim(), last_name: ten.trim() },
    token: tokenDangKy,
  })
  if (!taoRes.ok) return { ok: false, loi: taoRes.loi }

  // Bước 3 — đổi lấy token có actor_id. Xem khối chú thích trên.
  return goiDangNhap(e, matKhau)
}

/**
 * Đọc hồ sơ khách theo token. Trả `null` nếu token sai/hết hạn.
 *
 * ⚠️ Hàm này là NGUỒN SỰ THẬT DUY NHẤT cho câu hỏi "đã đăng nhập chưa".
 * Tuyệt đối không được thay bằng phép kiểm tra "cookie có tồn tại không" —
 * cookie còn nhưng token hết hạn là tình huống gây vòng lặp chuyển hướng.
 */
export async function goiLayHoSo(token: string): Promise<KhachHang | null> {
  if (!token) return null

  const res = await goi("/store/customers/me", { token })
  if (!res.ok) return null

  const kh = res.du_lieu?.customer
  return kh ? (kh as KhachHang) : null
}
