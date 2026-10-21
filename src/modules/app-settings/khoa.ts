import { LoiCaiDat } from "./loi"

/**
 * Danh sách khoá cài đặt CỐ ĐỊNH của Medusa. Khoá ngoài danh sách bị từ chối.
 * (deepseek_api_key, telegram_*, widget_key thuộc chatbot, KHÔNG nằm ở đây.)
 */
export const MAU_KHOA = /^[a-z][a-z0-9_]{1,63}$/
export const DO_DAI_TOI_DA = 255

export type NhomCaiDat = "lien_he" | "ngan_hang" | "van_chuyen" | "email"

export interface DinhNghiaKhoa {
  mo_ta: string
  nhom: NhomCaiDat
  mac_dinh: string
  /** Giá trị được mã hoá khi lưu và bị che khi liệt kê. */
  bi_mat: boolean
  /** Được phép trả qua GET /store/app-settings (không cần đăng nhập). */
  cong_khai: boolean
  /** Kiểm tra thêm cho giá trị KHÔNG rỗng đã cắt khoảng trắng. Trả thông báo lỗi hoặc null. */
  kiem_tra?: (v: string) => string | null
}

export const KHOA_CAI_DAT = {
  smtp_host: {
    mo_ta: "Máy chủ SMTP gửi email cho khách (xác nhận đơn, đặt lại mật khẩu).",
    nhom: "email",
    mac_dinh: "smtp.gmail.com",
    bi_mat: false,
    cong_khai: false,
  },
  smtp_port: {
    mo_ta: "Cổng SMTP (587 cho STARTTLS, 465 cho SSL).",
    nhom: "email",
    mac_dinh: "587",
    bi_mat: false,
    cong_khai: false,
    kiem_tra: (v: string) => {
      const n = Number(v)
      return /^\d+$/.test(v) && n >= 1 && n <= 65535 ? null : "phải là số nguyên từ 1 đến 65535"
    },
  },
  smtp_user: {
    mo_ta: "Tài khoản đăng nhập SMTP (thường là địa chỉ email gửi).",
    nhom: "email",
    mac_dinh: "",
    bi_mat: false,
    cong_khai: false,
  },
  smtp_pass: {
    mo_ta: "Mật khẩu SMTP (với Gmail là mật khẩu ứng dụng). Được mã hoá khi lưu.",
    nhom: "email",
    mac_dinh: "",
    bi_mat: true,
    cong_khai: false,
  },
  smtp_from: {
    mo_ta:
      "Địa chỉ/tên hiển thị người gửi, ví dụ: C.W. Wines <shop@example.com>. Trống thì dùng smtp_user.",
    nhom: "email",
    mac_dinh: "",
    bi_mat: false,
    cong_khai: false,
  },
  default_customer_email: {
    mo_ta:
      "Email gán cho đơn tạo qua chatbot khi khách không để lại email. Để trống = đơn không có email (khách không nhận mail xác nhận).",
    nhom: "lien_he",
    mac_dinh: "",
    bi_mat: false,
    cong_khai: false,
    kiem_tra: (v: string) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "không phải địa chỉ email hợp lệ",
  },
  hotline: {
    mo_ta: "Số điện thoại hotline hiển thị trên website và trong email.",
    nhom: "lien_he",
    mac_dinh: "",
    bi_mat: false,
    cong_khai: true,
  },
  zalo_phone: {
    mo_ta: "Số điện thoại Zalo (dùng cho nút chat Zalo).",
    nhom: "lien_he",
    mac_dinh: "",
    bi_mat: false,
    cong_khai: true,
  },
  bank_name: {
    mo_ta: "Tên ngân hàng nhận chuyển khoản.",
    nhom: "ngan_hang",
    mac_dinh: "",
    bi_mat: false,
    cong_khai: true,
  },
  bank_account: {
    mo_ta: "Số tài khoản ngân hàng (3 đến 20 chữ số).",
    nhom: "ngan_hang",
    mac_dinh: "",
    bi_mat: false,
    cong_khai: true,
    kiem_tra: (v: string) => (/^\d{3,20}$/.test(v) ? null : "phải gồm 3 đến 20 chữ số"),
  },
  bank_account_name: {
    mo_ta: "Tên chủ tài khoản ngân hàng.",
    nhom: "ngan_hang",
    mac_dinh: "",
    bi_mat: false,
    cong_khai: true,
  },
  bank_bin: {
    mo_ta: "Mã ngân hàng dùng tạo mã VietQR: mã chữ của VietQR (ví dụ MB, VCB) hoặc BIN 6 chữ số.",
    nhom: "ngan_hang",
    mac_dinh: "",
    bi_mat: false,
    cong_khai: true,
    kiem_tra: (v: string) =>
      /^[A-Za-z0-9]{2,12}$/.test(v) ? null : "phải là mã ngân hàng (2-12 chữ/số, ví dụ MB) hoặc BIN 6 chữ số",
  },
  shipping_provider: {
    mo_ta: "Đơn vị vận chuyển mặc định khi chốt đơn (ví dụ: ghn).",
    nhom: "van_chuyen",
    mac_dinh: "ghn",
    bi_mat: false,
    cong_khai: false,
  },
} satisfies Record<string, DinhNghiaKhoa>

export type KhoaCaiDat = keyof typeof KHOA_CAI_DAT

export const DANH_SACH_KHOA = Object.keys(KHOA_CAI_DAT) as KhoaCaiDat[]

export const KHOA_CONG_KHAI = DANH_SACH_KHOA.filter(
  (k) => (KHOA_CAI_DAT[k] as DinhNghiaKhoa).cong_khai
)

export function dinhNghiaKhoa(key: string): DinhNghiaKhoa | null {
  return Object.prototype.hasOwnProperty.call(KHOA_CAI_DAT, key)
    ? (KHOA_CAI_DAT[key as KhoaCaiDat] as DinhNghiaKhoa)
    : null
}

/** Ném LoiCaiDat("khoa_la") nếu khoá sai định dạng hoặc không có trong danh sách. */
export function baoDamKhoaHopLe(key: unknown): asserts key is KhoaCaiDat {
  if (typeof key !== "string" || !MAU_KHOA.test(key)) {
    throw new LoiCaiDat("khoa_la", `Tên khoá không hợp lệ: ${JSON.stringify(key)}`)
  }
  if (!dinhNghiaKhoa(key)) {
    throw new LoiCaiDat("khoa_la", `Khoá không được hỗ trợ: ${key}`)
  }
}

export type KetQuaKiemTra = { ok: true; value: string } | { ok: false; loi: string }

/**
 * Kiểm tra giá trị cho một khoá. Giá trị được cắt khoảng trắng hai đầu;
 * chuỗi rỗng hợp lệ và có nghĩa là "xoá khoá".
 */
export function kiemTraGiaTri(key: string, value: unknown): KetQuaKiemTra {
  const dn = dinhNghiaKhoa(key)
  if (!MAU_KHOA.test(key) || !dn) return { ok: false, loi: `${key}: khoá không được hỗ trợ` }
  if (typeof value !== "string") return { ok: false, loi: `${key}: giá trị phải là chuỗi` }
  const v = value.trim()
  if (v.length > DO_DAI_TOI_DA) return { ok: false, loi: `${key}: dài tối đa ${DO_DAI_TOI_DA} ký tự` }
  if (/[\u0000-\u001f\u007f]/.test(v)) return { ok: false, loi: `${key}: không được chứa ký tự điều khiển` }
  if (v && dn.kiem_tra) {
    const l = dn.kiem_tra(v)
    if (l) return { ok: false, loi: `${key}: ${l}` }
  }
  return { ok: true, value: v }
}
