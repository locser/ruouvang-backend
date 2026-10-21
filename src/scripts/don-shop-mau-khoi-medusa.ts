/**
 * ═══════════════════════════════════════════════════════════════════════
 *  DỌN DỮ LIỆU BA SHOP MẪU KHỎI CSDL `medusa`
 *
 *  Chạy MỘT LẦN sau khi Coolmate/Hasaki/Yody đã được tách sang CSDL riêng
 *  (medusa_coolmate · medusa_hasaki · medusa_yody) và ba site đã chạy đúng.
 *
 *  Trước 04/08/2026 ba shop này nằm chung CSDL `medusa` với Ẩm Thực Xứ Huế.
 *  Sau khi tách, bản sao trong `medusa` là dữ liệu thừa: làm CSDL của Huế
 *  phình từ 95 lên 11.975 sản phẩm và khiến site Huế thấy hàng shop khác.
 *
 *  Chạy:
 *    docker exec -e CHI_XEM=1 medusa-backend sh -c \
 *      "cd /app/apps/backend && npx medusa exec ./src/scripts/don-shop-mau-khoi-medusa.ts"
 *
 *  Bỏ CHI_XEM để xoá thật. LUÔN chạy CHI_XEM=1 trước và đọc kỹ con số.
 *
 *  ⚠️ CHỈ chạy trên container `medusa-backend` (CSDL `medusa`). Chạy nhầm
 *  trên backend của shop khác là xoá sạch hàng của chính shop đó.
 * ═══════════════════════════════════════════════════════════════════════
 */
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/** Ba shop đã được tách sang CSDL riêng. */
const SHOP_DA_TACH = ["coolmate", "hasaki", "yody"]

/** Dấu nguồn mà seed-real-catalogs.ts đóng vào danh mục nó tạo. */
const NGUON_DANH_MUC = "crawl-real"

export default async function donShopMau({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModule = container.resolve(Modules.PRODUCT)

  const chiXem =
    process.env.CHI_XEM === "1" || process.env.CHI_XEM === "true"

  logger.info("╔══════════════════════════════════════════════════════════╗")
  logger.info("║  DỌN DỮ LIỆU 3 SHOP MẪU KHỎI CSDL `medusa`              ║")
  logger.info("╚══════════════════════════════════════════════════════════╝")

  // ── Chốt an toàn: đúng CSDL `medusa` mới được chạy ──────────────────
  const duongDanDb = process.env.CONFIG_POSTGRES_URL_MEDUSA ?? ""
  const tenDb = duongDanDb.split("/").pop()?.split("?")[0] ?? "(không rõ)"
  logger.info(`CSDL đang nối: ${tenDb}`)
  if (tenDb !== "medusa") {
    throw new Error(
      `Script này chỉ được chạy trên CSDL "medusa", đang nối "${tenDb}". ` +
        `Chạy nhầm sẽ xoá sạch hàng của shop đó. Dừng lại.`
    )
  }

  // ── 1. Sản phẩm của ba shop mẫu ─────────────────────────────────────
  const { data: tatCaSanPham } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "metadata"],
    pagination: { take: 100000, skip: 0 },
  })

  const canXoa = tatCaSanPham.filter((p: any) =>
    SHOP_DA_TACH.includes((p.metadata as any)?.shop)
  )
  const giuLai = tatCaSanPham.length - canXoa.length

  const theoShop: Record<string, number> = {}
  for (const p of canXoa) {
    const s = (p.metadata as any).shop
    theoShop[s] = (theoShop[s] ?? 0) + 1
  }

  logger.info("")
  logger.info(`Sản phẩm trong CSDL   : ${tatCaSanPham.length}`)
  logger.info(`  → sẽ XOÁ            : ${canXoa.length}  ${JSON.stringify(theoShop)}`)
  logger.info(`  → GIỮ LẠI           : ${giuLai}  (hàng của Ẩm Thực Xứ Huế)`)

  // ── 2. Danh mục do seed-real-catalogs.ts tạo ────────────────────────
  const dsDanhMuc = await productModule.listProductCategories(
    {},
    { select: ["id", "handle", "metadata", "parent_category_id"], take: null }
  )
  const danhMucCanXoa = dsDanhMuc.filter(
    (c: any) => (c.metadata as any)?.nguon === NGUON_DANH_MUC
  )
  logger.info(
    `Danh mục trong CSDL   : ${dsDanhMuc.length}  → sẽ XOÁ ${danhMucCanXoa.length}`
  )

  // ── 3. Chốt an toàn: không đụng vào sản phẩm đã có đơn hàng ─────────
  const idXoa = new Set(canXoa.map((p: any) => p.id))
  const { data: dongDon } = await query.graph({
    entity: "order_line_item",
    fields: ["id", "product_id"],
    pagination: { take: 100000, skip: 0 },
  })
  const vuongDon = dongDon.filter(
    (d: any) => d.product_id && idXoa.has(d.product_id)
  )
  if (vuongDon.length > 0) {
    logger.error("")
    logger.error(
      `✖ DỪNG: ${vuongDon.length} dòng đơn hàng đang trỏ tới sản phẩm sắp xoá.`
    )
    logger.error("  Xoá sẽ làm hỏng lịch sử đơn. Kiểm tra lại trước khi tiếp tục.")
    return
  }
  logger.info(`Đơn hàng bị ảnh hưởng : 0  ✓`)

  if (chiXem) {
    logger.info("")
    logger.info("(CHI_XEM=1 — không xoá gì cả. Bỏ biến này để xoá thật.)")
    return
  }

  // ── 4. Xoá ───────────────────────────────────────────────────────────
  logger.info("")
  for (let i = 0; i < canXoa.length; i += 200) {
    const lo = canXoa.slice(i, i + 200).map((p: any) => p.id)
    await productModule.deleteProducts(lo)
    if ((i / 200) % 10 === 0) {
      logger.info(`  … đã xoá ${Math.min(i + 200, canXoa.length)}/${canXoa.length}`)
    }
  }
  logger.info(`✓ Đã xoá ${canXoa.length} sản phẩm`)

  if (danhMucCanXoa.length > 0) {
    // ⚠️ Phải xoá từ LÁ lên GỐC. Medusa từ chối xoá danh mục còn con:
    // "Deleting ProductCategory (...) with category children is not allowed".
    // Xoá cả mảng một lần là hỏng ngay ở danh mục cha đầu tiên gặp phải.
    const idCanXoa = new Set(danhMucCanXoa.map((c: any) => c.id))
    const conCuaCha = new Map<string, number>()
    for (const c of danhMucCanXoa) {
      const cha = (c as any).parent_category_id
      if (cha && idCanXoa.has(cha)) {
        conCuaCha.set(cha, (conCuaCha.get(cha) ?? 0) + 1)
      }
    }

    let conLai = [...danhMucCanXoa]
    let daXoa = 0
    let vong = 0
    while (conLai.length > 0 && vong < 20) {
      vong++
      // Lá = danh mục không còn con nào nằm trong danh sách chờ xoá.
      const la = conLai.filter((c: any) => !conCuaCha.get(c.id))
      if (la.length === 0) {
        logger.warn(
          `  ⚠ Còn ${conLai.length} danh mục không xoá được (nghi vòng lặp cha–con)`
        )
        break
      }
      await productModule.deleteProductCategories(la.map((c: any) => c.id))
      daXoa += la.length

      // Cha của các lá vừa xoá giảm một bậc số con.
      for (const c of la) {
        const cha = (c as any).parent_category_id
        if (cha && conCuaCha.has(cha)) {
          const n = conCuaCha.get(cha)! - 1
          if (n <= 0) conCuaCha.delete(cha)
          else conCuaCha.set(cha, n)
        }
      }
      const idVuaXoa = new Set(la.map((c: any) => c.id))
      conLai = conLai.filter((c: any) => !idVuaXoa.has(c.id))
      logger.info(`  … tầng ${vong}: xoá ${la.length}, còn ${conLai.length}`)
    }
    logger.info(`✓ Đã xoá ${daXoa} danh mục`)
  }

  logger.info("")
  logger.info("Hoàn tất. Nhớ chạy sync-meili.ts + dọn document mồ côi (ADMIN_GUIDE 4.F).")
}
