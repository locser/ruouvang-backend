import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { layCaiDat } from "../../../lib/lay-cai-dat"
import { KHOA_CONG_KHAI } from "../../../modules/app-settings/khoa"

/**
 * GET /store/app-settings: chỉ các khoá đánh dấu cong_khai (hotline, zalo, ngân hàng).
 * Không bao giờ trả khoá SMTP hay khoá bí mật. /store/* bắt buộc header
 * x-publishable-api-key (hành vi mặc định của Medusa).
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const cd = (await layCaiDat(req.scope)) as Record<string, string | undefined>
  const settings: Record<string, string> = {}
  for (const k of KHOA_CONG_KHAI) settings[k] = cd[k] ?? ""
  res.setHeader("Cache-Control", "public, max-age=30")
  res.json({ settings })
}
