/**
 * ═══════════════════════════════════════════════════════════════════════
 *  VP Holding — Seed trang chủ mặc định cho Page Builder
 *  Chạy: docker compose exec medusa npx medusa exec ./src/scripts/seed-pages.ts
 *        (local)  npx medusa exec ./src/scripts/seed-pages.ts
 *
 *  Idempotent: chạy lại KHÔNG tạo trùng, KHÔNG ghi đè nội dung anh đã sửa.
 *  Muốn dựng lại từ đầu: xoá trang trong Admin rồi chạy lại.
 * ═══════════════════════════════════════════════════════════════════════
 */
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { PAGE_BUILDER_MODULE } from "../modules/page_builder"
import type PageBuilderModuleService from "../modules/page_builder/service"

export default async function seedPages({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service: PageBuilderModuleService = container.resolve(PAGE_BUILDER_MODULE)

  logger.info("═══ Seed trang chủ (Page Builder) ═══")

  // ────────────────────────────────────────── 1. Mẫu trang "home" ──
  const existing = await service.listPageTemplates({ handle: "home" })

  if (existing.length) {
    logger.info('  Trang "home" đã có — bỏ qua (không ghi đè nội dung đã sửa).')
    logger.info(`  Sửa tại: Admin → Page Builder`)
    return
  }

  const [home] = await service.createPageTemplates([
    {
      handle: "home",
      title: "Trang chủ",
      status: "published",
    },
  ])
  logger.info(`  ✔ Tạo mẫu trang "home" (${home.id})`)

  // ───────────────────────────────── 2. Các khối, theo đúng thứ tự ──
  // Settings lấy mặc định từ lược đồ, rồi ghi đè phần riêng của VPH.
  const blocks: { type: string; settings?: Record<string, unknown> }[] = [
    {
      type: "announcement",
      settings: {
        message: "Giao hàng lạnh nội thành trong 24 giờ",
        bg_color: "#1f3a2e",
      },
    },
    {
      type: "hero",
      settings: {
        heading: "Rau củ lên men — nuôi dưỡng từ gốc",
        subheading:
          "Lên men tự nhiên theo phương pháp truyền thống, không chất bảo quản.",
        cta_label: "Xem sản phẩm",
        cta_url: "/store",
        align: "center",
      },
    },
    {
      type: "trust_badges",
      settings: {
        item_1: "Lên men tự nhiên",
        item_2: "Không chất bảo quản",
        item_3: "Giao lạnh trong 48 giờ",
      },
    },
    {
      type: "product_grid",
      settings: {
        heading: "Sản phẩm nổi bật",
        limit: 8,
        columns: "4",
        show_price: true,
      },
    },
    {
      type: "rich_text",
      settings: {
        heading: "Vì sao chúng tôi lên men",
        body:
          "Mỗi mẻ rau củ được ủ trong điều kiện kiểm soát, theo dõi từng ngày. " +
          "Chúng tôi công bố rõ nguồn nguyên liệu và quy trình.",
        width: "narrow",
      },
    },
  ]

  for (const b of blocks) {
    const result = await service.addSection(home.id, b.type)

    if ("error" in result && result.error) {
      logger.error(`  ✖ Khối "${b.type}": ${result.error}`)
      continue
    }

    // ⚠️ Ghi TRỌN VẸN settings (mặc định từ lược đồ + phần riêng của VPH).
    //    json() của Medusa merge chứ không thay thế — ghi từng phần sẽ để
    //    lẫn giá trị cũ. Ở đây trang mới nên chưa có gì cũ, nhưng giữ đúng
    //    thói quen để về sau không sai.
    if (b.settings && result.section) {
      await service.setSectionSettings(result.section.id, {
        ...(result.section.settings as Record<string, unknown>),
        ...b.settings,
      })
    }

    logger.info(`  ✔ Thêm khối "${b.type}"`)
  }

  logger.info("═══════════════════════════════════════════")
  logger.info(`  Xong. ${blocks.length} khối trên trang chủ.`)
  logger.info(`  Sửa/bật/tắt/sắp xếp: Admin → Page Builder`)
  logger.info(`  Storefront đọc qua: GET /store/page-templates/home`)
  logger.info("═══════════════════════════════════════════")
}
