import { readFileSync, existsSync } from "fs"
import path from "path"
import type { ExecArgs } from "@medusajs/framework/types"
import { APP_SETTINGS_MODULE } from "../modules/app-settings"
import { dinhNghiaKhoa } from "../modules/app-settings/khoa"
import { anhXaEnvSangCaiDat, phanTichEnv } from "../lib/nap-cai-dat"

/**
 * Nạp MỘT LẦN cài đặt từ file .env gốc vào bảng app_settings của Medusa.
 *
 *   npx medusa exec ./src/scripts/nap-cai-dat-tu-env.ts [duong-dan-.env] [--dry-run] [--force]
 *
 *  - Mặc định đọc ../../../.env (tính từ apps/backend = gốc monorepo).
 *  - --dry-run: chỉ in ra, không ghi.
 *  - Mặc định KHÔNG ghi đè khoá đã có trong DB; thêm --force để ghi đè.
 *  - Khoá bí mật (smtp_pass) cần CONFIG_ENCRYPTION_KEY_MEDUSA; giá trị bí mật không bao giờ được in.
 */
export default async function napCaiDatTuEnv({ container, args }: ExecArgs) {
  // `medusa exec` có thể nuốt cờ --xxx, nên đọc cả process.argv và biến môi trường.
  const tatCa = [...(args ?? []), ...process.argv.slice(2)]
  const dryRun = tatCa.includes("--dry-run") || process.env.DRY_RUN === "1"
  const force = tatCa.includes("--force") || process.env.FORCE === "1"
  const duongDanArg = tatCa.find(
    (a) => !a.startsWith("--") && /(^|[\/])\.env[^\/]*$/.test(a)
  )
  const duongDan = path.resolve(process.cwd(), duongDanArg ?? "../../../.env")

  if (!existsSync(duongDan)) {
    console.error(`[nap-cai-dat] Không thấy file: ${duongDan}`)
    return
  }
  console.log(`[nap-cai-dat] Đọc ${duongDan}${dryRun ? " (dry-run)" : ""}`)

  const { nap, bo_qua } = anhXaEnvSangCaiDat(phanTichEnv(readFileSync(duongDan, "utf8")))
  const service: any = container.resolve(APP_SETTINGS_MODULE)
  const daCo = new Set<string>(
    (await service.lietKe({ che: true })).filter((m: any) => m.nguon === "db").map((m: any) => m.key)
  )

  const ghi: Record<string, string> = {}
  for (const [khoa, giaTri] of Object.entries(nap)) {
    if (daCo.has(khoa) && !force) {
      console.log(`  - ${khoa}: đã có trong DB, giữ nguyên (dùng --force để ghi đè)`)
      continue
    }
    ghi[khoa] = giaTri
    const biMat = dinhNghiaKhoa(khoa)?.bi_mat
    console.log(`  + ${khoa}: ${biMat ? "(bí mật, không in)" : giaTri}`)
  }
  for (const b of bo_qua) console.log(`  . bỏ qua ${b.env}: ${b.ly_do}`)

  if (dryRun) {
    console.log(`[nap-cai-dat] dry-run: sẽ nạp ${Object.keys(ghi).length} khoá, chưa ghi gì.`)
    return
  }
  if (!Object.keys(ghi).length) {
    console.log("[nap-cai-dat] Không có gì để nạp.")
    return
  }
  const kq = await service.datNhieu(ghi, "nap-tu-env")
  console.log(`[nap-cai-dat] Đã nạp ${kq.da_dat.length} khoá: ${kq.da_dat.join(", ")}`)
}
