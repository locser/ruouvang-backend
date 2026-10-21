/**
 * ═══════════════════════════════════════════════════════════════════════
 *  Khởi tạo LOCALE + cấu hình trường được dịch
 *  Chạy: docker compose exec medusa npx medusa exec ./src/scripts/setup-locales.ts
 * ───────────────────────────────────────────────────────────────────────
 *  ⚠️ QUYẾT ĐỊNH KHÔNG QUAY LẠI ĐƯỢC:
 *  Locale dùng mã THỊ TRƯỜNG theo chuẩn BCP 47 (vi-VN, en-US, en-IE…),
 *  KHÔNG dùng mã ngôn ngữ trần (vi, en).
 *
 *  Vì sao: quy định công bố sức khoẻ khác nhau theo QUỐC GIA, không theo
 *  ngôn ngữ. Cùng tiếng Anh: en-US được nói "probiotic", en-IE thì KHÔNG
 *  (EU coi đó là health claim — Reg 1924/2006).
 *  Nếu đặt locale = "en" thì sau này KHÔNG tách được → phải làm lại toàn bộ.
 * ═══════════════════════════════════════════════════════════════════════
 */
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

// Pilot giai đoạn 1: chỉ vi-VN.
// Mở thị trường mới = bỏ comment 1 dòng + thêm luật vào claim-guard.ts
const LOCALES = [
  { code: "vi-VN", name: "Tiếng Việt (Việt Nam)" },
  // { code: "en-US", name: "English (United States)" },
  // { code: "en-IE", name: "English (Ireland — EU)" },
  // { code: "ja-JP", name: "日本語 (日本)" },
]

// Trường được phép dịch cho từng loại thực thể
const SETTINGS = [
  { entity_type: "product",            fields: ["title", "description", "subtitle", "material"] },
  { entity_type: "product_variant",    fields: ["title", "material"] },
  { entity_type: "product_category",   fields: ["name", "description"] },
  { entity_type: "product_collection", fields: ["title"] },
  { entity_type: "product_option",     fields: ["title"] },
  { entity_type: "product_tag",        fields: ["value"] },
  { entity_type: "product_type",       fields: ["value"] },
]

export default async function setupLocales({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const svc: any = container.resolve(Modules.TRANSLATION)

  logger.info("→ Khởi tạo locale…")
  const existing = await svc.listLocales({})
  const have = new Set(existing.map((l: any) => l.code))

  const toAdd = LOCALES.filter((l) => !have.has(l.code))
  if (toAdd.length) {
    await svc.createLocales(toAdd)
    toAdd.forEach((l) => logger.info(`  ✓ ${l.code} — ${l.name}`))
  } else {
    logger.info("  ✓ Locale đã có đủ")
  }

  logger.info("→ Cấu hình trường được dịch…")
  const existingSettings = await svc.listTranslationSettings({})
  const haveEntity = new Set(existingSettings.map((s: any) => s.entity_type))

  for (const s of SETTINGS) {
    if (haveEntity.has(s.entity_type)) {
      logger.info(`  · ${s.entity_type} — đã cấu hình, bỏ qua`)
      continue
    }
    await svc.createTranslationSettings({ ...s, is_active: true })
    logger.info(`  ✓ ${s.entity_type} → [${s.fields.join(", ")}]`)
  }

  logger.info("")
  logger.info("═══════════════════════════════════════════")
  logger.info(" LOCALE SẴN SÀNG")
  logger.info(" Admin → Settings → Translations để dịch hàng loạt")
  logger.info(" API   → gửi header  x-medusa-locale: vi-VN")
  logger.info("═══════════════════════════════════════════")
}
