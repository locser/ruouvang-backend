import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"
import { LoiCaiDat } from "./loi"

/**
 * Mã hoá khoá bí mật (smtp_pass) bằng AES-256-GCM.
 * Khoá 32 byte = sha256(CONFIG_ENCRYPTION_KEY_MEDUSA). Biến này RIÊNG của Medusa, khác
 * ENCRYPTION_KEY của chatbot, để lộ một bên không lộ bên kia.
 * Định dạng lưu: `iv_hex:tag_hex:cipher_hex`.
 */
export const TEN_BIEN_KHOA_MA_HOA = "CONFIG_ENCRYPTION_KEY_MEDUSA"

function layKhoa(matKhau?: string): Buffer {
  const goc = matKhau ?? process.env[TEN_BIEN_KHOA_MA_HOA] ?? ""
  if (!goc.trim()) {
    throw new LoiCaiDat(
      "thieu_khoa_ma_hoa",
      `Chưa cấu hình biến môi trường ${TEN_BIEN_KHOA_MA_HOA} nên không thể lưu khoá bí mật. Đặt biến này rồi khởi động lại Medusa.`
    )
  }
  return createHash("sha256").update(goc, "utf8").digest()
}

export function maHoa(banRo: string, matKhau?: string): string {
  const khoa = layKhoa(matKhau)
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", khoa, iv)
  const ct = Buffer.concat([cipher.update(banRo, "utf8"), cipher.final()])
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${ct.toString("hex")}`
}

/** Sai khoá / dữ liệu hỏng: trả "" và gọi canhBao, KHÔNG ném lỗi. */
export function giaiMa(
  daMaHoa: string,
  matKhau?: string,
  canhBao: (tb: string) => void = (tb) => console.warn(tb)
): string {
  if (!daMaHoa) return ""
  try {
    const khoa = layKhoa(matKhau)
    const phan = daMaHoa.split(":")
    if (phan.length !== 3) throw new Error("định dạng không đúng")
    const [iv, tag, ct] = phan.map((p) => Buffer.from(p, "hex"))
    const decipher = createDecipheriv("aes-256-gcm", khoa, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8")
  } catch (e: any) {
    canhBao(`[app-settings] không giải mã được khoá bí mật (sai ${TEN_BIEN_KHOA_MA_HOA}?): ${e?.message ?? e}`)
    return ""
  }
}

/** Che bí mật: "••••" + 4 ký tự cuối (giá trị ≤ 4 ký tự thì chỉ "••••"). */
export function cheBiMat(banRo: string): string {
  if (!banRo) return ""
  return banRo.length > 4 ? `••••${banRo.slice(-4)}` : "••••"
}
