import { kiemTraGiaTri } from "../modules/app-settings/khoa"

/**
 * Logic thuần của script nạp một lần `scripts/nap-cai-dat-tu-env.ts`:
 * đọc nội dung .env, ánh xạ sang khoá cài đặt, bỏ giá trị rỗng/giả/không hợp lệ.
 */
export const ANH_XA_ENV: Record<string, string> = {
  SMTP_HOST: "smtp_host",
  SMTP_PORT: "smtp_port",
  SMTP_USER: "smtp_user",
  SMTP_PASS: "smtp_pass",
  SMTP_FROM: "smtp_from",
  NEXT_PUBLIC_HOTLINE: "hotline",
  NEXT_PUBLIC_ZALO_PHONE: "zalo_phone",
  MEDUSA_BANK_NAME: "bank_name",
  MEDUSA_BANK_ACCOUNT: "bank_account",
  MEDUSA_BANK_ACCOUNT_NAME: "bank_account_name",
  MEDUSA_BANK_BIN: "bank_bin",
  SHIPPING_PROVIDER: "shipping_provider",
}

/** Phân tích nội dung .env đơn giản: KEY=VALUE, bỏ dòng trống và chú thích, gỡ cặp nháy bao ngoài. */
export function phanTichEnv(noiDung: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const dong of noiDung.replace(/^﻿/, "").split(/\r?\n/)) {
    const m = dong.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1)
    else v = v.replace(/\s+#.*$/, "").trim()
    out[m[1]] = v
  }
  return out
}

/** Giá trị mẫu/giả không được nạp. */
export function laGiaTriGia(v: string): boolean {
  return /^REPLACE_WITH/i.test(v) || /^mock_/i.test(v) || /chua-dung-den/i.test(v)
}

export interface KetQuaAnhXa {
  /** Khoá cài đặt, giá trị sẽ nạp. */
  nap: Record<string, string>
  /** Biến env bị bỏ qua và lý do (không chứa giá trị). */
  bo_qua: { env: string; ly_do: string }[]
}

export function anhXaEnvSangCaiDat(env: Record<string, string>): KetQuaAnhXa {
  const nap: Record<string, string> = {}
  const bo_qua: KetQuaAnhXa["bo_qua"] = []
  for (const [bien, khoa] of Object.entries(ANH_XA_ENV)) {
    const v = (env[bien] ?? "").trim()
    if (!v) {
      bo_qua.push({ env: bien, ly_do: "rỗng/không có" })
      continue
    }
    if (laGiaTriGia(v)) {
      bo_qua.push({ env: bien, ly_do: "giá trị giả/mẫu" })
      continue
    }
    const kq = kiemTraGiaTri(khoa, v)
    if (!kq.ok) {
      bo_qua.push({ env: bien, ly_do: "không hợp lệ" })
      continue
    }
    nap[khoa] = kq.value
  }
  return { nap, bo_qua }
}
