/**
 * ═══════════════════════════════════════════════════════════════════════
 *  VP Holding — Seed Catalogs for Coolmate, Yody & Hasaki Templates
 *  Execution: docker compose exec medusa npx medusa exec ./src/scripts/seed-coolmate-yody-hasaki.ts
 * ═══════════════════════════════════════════════════════════════════════
 */
import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createProductCategoriesWorkflow,
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows"

type CatalogItem = {
  title: string
  category: string
  brand: "Coolmate" | "Yody" | "Hasaki"
  description: string
  price: number
  handle: string
  sku: string
  thumbnail: string
  images: string[]
  options?: { name: string; values: string[] }[]
  tags?: string[]
}

const TEMPLATE_CATALOG: CatalogItem[] = [
  // ── COOLMATE (Digital Native D2C - Men's Fashion) ──
  {
    title: "Áo Thun Nam Coolmate Cotton Compact Premium",
    category: "Coolmate Men's Fashion",
    brand: "Coolmate",
    description: "Áo thun nam chất liệu 100% Cotton Compact cao cấp, mềm mịn, thấm hút mồ hôi vượt trội. Công nghệ may chống nhão cổ, độ bền gấp 3 lần cotton thông thường.",
    price: 199000,
    handle: "ao-thun-coolmate-cotton-compact-premium",
    sku: "COOL-AT-001",
    thumbnail: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=800&q=80"
    ],
    options: [
      { name: "Màu sắc", values: ["Đen", "Trắng", "Xanh Navy"] },
      { name: "Size", values: ["S", "M", "L", "XL", "2XL"] }
    ],
    tags: ["Coolmate", "Cotton Compact", "D2C", "Best Seller"]
  },
  {
    title: "Quần Lót Nam Trunk Excool Kháng Khuẩn",
    category: "Coolmate Men's Underwear",
    brand: "Coolmate",
    description: "Quần lót Nam kiểu dáng Trunk ứng dụng công nghệ sợi Excool làm mát nhanh, mỏng nhẹ 0.1mm, mạ ion bạc khử mùi & kháng khuẩn 99.9%.",
    price: 99000,
    handle: "quan-lot-nam-trunk-excool-khang-khuan",
    sku: "COOL-QL-002",
    thumbnail: "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=800&q=80"
    ],
    options: [
      { name: "Màu sắc", values: ["Đen", "Ghi Xám"] },
      { name: "Size", values: ["M", "L", "XL", "2XL"] }
    ],
    tags: ["Coolmate", "Excool", "Kháng khuẩn"]
  },
  {
    title: "Áo Polo Nam Coolmate Ultra-Cool Thể Thao",
    category: "Coolmate Polo Shirts",
    brand: "Coolmate",
    description: "Áo Polo phom dáng Slim-fit chuẩn công sở & thể thao. Vải pima dệt phối sợi spandex co giãn 4 chiều, cổ áo bo dệt chống quăn gấp.",
    price: 269000,
    handle: "ao-polo-nam-coolmate-ultra-cool-the-thao",
    sku: "COOL-AP-003",
    thumbnail: "https://images.unsplash.com/photo-1625910513413-7fc258671408?auto=format&fit=crop&w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1625910513413-7fc258671408?auto=format&fit=crop&w=800&q=80"
    ],
    options: [
      { name: "Size", values: ["S", "M", "L", "XL"] }
    ],
    tags: ["Polo", "Coolmate", "Ultra-Cool"]
  },
  {
    title: "Tủ Đồ Nam Giới Daily Capsule Combo (5 Món)",
    category: "Coolmate Capsule Combo",
    brand: "Coolmate",
    description: "Giải pháp tủ đồ thông minh cho nam giới năng động: Gồm 2 Áo thun Cotton Compact + 2 Quần lót Trunk Excool + 1 Đôi tất Bamboo. Tiết kiệm 25% khi mua combo.",
    price: 699000,
    handle: "tu-do-nam-gioi-daily-capsule-combo",
    sku: "COOL-CB-004",
    thumbnail: "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=800&q=80"
    ],
    tags: ["Combo Tiết Kiệm", "Capsule Wardrobe"]
  },

  // ── YODY (Omnichannel & Family Fashion) ──
  {
    title: "Áo Polo Nam Yody Pique Mắt Chim Thoáng Mát",
    category: "Yody Men's Fashion",
    brand: "Yody",
    description: "Dòng áo Polo biểu tượng của Yody với chất liệu vải Pique hiệu ứng mắt chim độc quyền. Giữ phom chuẩn đẹp, thoáng khí, chống nhăn tự nhiên.",
    price: 299000,
    handle: "ao-polo-nam-yody-pique-mat-chim",
    sku: "YODY-PL-001",
    thumbnail: "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?auto=format&fit=crop&w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?auto=format&fit=crop&w=800&q=80"
    ],
    options: [
      { name: "Màu sắc", values: ["Vàng Yody", "Xanh Vàng", "Đen"] },
      { name: "Size", values: ["M", "L", "XL", "2XL"] }
    ],
    tags: ["Yody", "Polo Mắt Chim", "Omnichannel"]
  },
  {
    title: "Bộ Đồ Gia Đình Yody Joyful Days (Set Bố Mẹ Bé)",
    category: "Yody Family Collection",
    brand: "Yody",
    description: "Bộ đồng phục gia đình chất liệu Cotton 100% thân thiện làn da, thiết kế năng động trẻ trung thích hợp đi du lịch & chụp ảnh gia đình.",
    price: 799000,
    handle: "bo-do-gia-dinh-yody-joyful-days",
    sku: "YODY-FM-002",
    thumbnail: "https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=800&q=80"
    ],
    tags: ["Yody Gia Đình", "Đồ Đôi", "Shoppertainment"]
  },
  {
    title: "Quần Jeans Nam Yody Flex Co Giãn Thoải Mái",
    category: "Yody Jeans",
    brand: "Yody",
    description: "Quần Jeans nam ứng dụng công nghệ Yody Flex đàn hồi siêu việt. Đứng ngồi vận động cực kỳ êm ái, màu xanh denim bền đẹp theo thời gian.",
    price: 499000,
    handle: "quan-jeans-nam-yody-flex-co-gian",
    sku: "YODY-JN-003",
    thumbnail: "https://images.unsplash.com/photo-1542272604-780c36856f61?auto=format&fit=crop&w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1542272604-780c36856f61?auto=format&fit=crop&w=800&q=80"
    ],
    tags: ["Yody Jeans", "Co Giãn Flex"]
  },

  // ── HASAKI (O2O Cosmetics & Speed Logistics) ──
  {
    title: "Kem Chống Nắng La Roche-Posay Anthelios UVmune 400 SPF50+ 50ml",
    category: "Hasaki Skincare & Sunscreen",
    brand: "Hasaki",
    description: "Kem chống nắng màng lọc Mexoryl 400 độc quyền chống tia UVA dài. Kiểm soát dầu nhờn 12 giờ, không gây vệt trắng, đền 200% nếu phát hiện hàng giả.",
    price: 465000,
    handle: "kem-chong-nang-la-roche-posay-anthelios-uvmune-400",
    sku: "HSAK-CS-001",
    thumbnail: "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=800&q=80"
    ],
    tags: ["Hasaki Certified", "NowFree 2H", "Chính Hãng 200%"]
  },
  {
    title: "Nước Tẩy Trang Bioderma Sensibio H2O Nắp Hồng 500ml",
    category: "Hasaki Cleanser",
    brand: "Hasaki",
    description: "Nước tẩy trang công nghệ Micellar làm sạch 99% lớp trang điểm và khói bụi mịn, làm dịu da nhạy cảm không gây rát da.",
    price: 425000,
    handle: "nuoc-tay-trang-bioderma-sensibio-h2o-500ml",
    sku: "HSAK-TT-002",
    thumbnail: "https://images.unsplash.com/photo-1608248597262-8382ebd90f77?auto=format&fit=crop&w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1608248597262-8382ebd90f77?auto=format&fit=crop&w=800&q=80"
    ],
    tags: ["Bioderma", "Hasaki 2H", "Mỹ Phẩm"]
  },
  {
    title: "Serum Skin1004 Madagascar Centella Ampoule Rau Má 100ml",
    category: "Hasaki Serum & Essence",
    brand: "Hasaki",
    description: "Tinh chất rau má Madagascar tinh khiết 100% giúp kháng viêm, làm dịu mụn sưng đỏ, tái tạo hàng rào bảo vệ da ẩm mượt.",
    price: 385000,
    handle: "serum-skin1004-madagascar-centella-ampoule-100ml",
    sku: "HSAK-SR-003",
    thumbnail: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=800&q=80"
    ],
    tags: ["Skin1004", "Rau Má", "Hasaki Spa Approved"]
  }
]

export default async function seedTemplates({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productModuleService = container.resolve(Modules.PRODUCT)
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL)

  logger.info("🚀 Creating Product Categories and Seeding Template Catalogs (Coolmate, Yody, Hasaki)...")

  // Ensure sales channel exists
  const salesChannels = await salesChannelModuleService.listSalesChannels()
  let defaultSalesChannel = salesChannels.find((sc) => sc.name === "Default Sales Channel") || salesChannels[0]

  // Create Categories
  const categoryNames = Array.from(new Set(TEMPLATE_CATALOG.map((i) => i.category)))
  const existingCategories = await productModuleService.listProductCategories()
  const existingCatNames = new Set(existingCategories.map((c) => c.name))

  const newCategories = categoryNames.filter((c) => !existingCatNames.has(c))
  if (newCategories.length > 0) {
    try {
      await createProductCategoriesWorkflow(container).run({
        input: {
          product_categories: newCategories.map((name) => ({
            name,
            is_active: true,
          })),
        },
      })
    } catch (e) {
      logger.info("Some categories already exist, continuing...")
    }
  }

  const allCategories = await productModuleService.listProductCategories()
  const catMap = new Map(allCategories.map((c) => [c.name, c.id]))

  // Check existing products
  const existingProducts = await productModuleService.listProducts()
  const existingSkus = new Set(existingProducts.flatMap((p) => p.variants?.map((v) => v.sku) || []))

  const productsToCreate = TEMPLATE_CATALOG.filter((item) => !existingSkus.has(item.sku))

  logger.info(`📦 Seeding ${productsToCreate.length} new products for Coolmate, Yody, and Hasaki...`)

  if (productsToCreate.length > 0) {
    await createProductsWorkflow(container).run({
      input: {
        products: productsToCreate.map((item) => ({
          title: item.title,
          subtitle: `Thương hiệu ${item.brand}`,
          description: item.description,
          handle: item.handle,
          status: ProductStatus.PUBLISHED,
          thumbnail: item.thumbnail,
          images: item.images.map((url) => ({ url })),
          category_ids: catMap.get(item.category) ? [catMap.get(item.category)!] : [],
          sales_channels: defaultSalesChannel ? [{ id: defaultSalesChannel.id }] : [],
          options: item.options ? item.options.map(o => ({ title: o.name, values: o.values })) : [{ title: "Default", values: ["Standard"] }],
          variants: [
            {
              title: item.title,
              sku: item.sku,
              barcode: item.sku,
              prices: [
                {
                  currency_code: "vnd",
                  amount: item.price,
                },
              ],
              options: item.options 
                ? Object.fromEntries(item.options.map(o => [o.name, o.values[0]])) 
                : { Default: "Standard" },
            },
          ],
        })),
      },
    })
  }

  logger.info("✅ Seeding completed successfully for Coolmate, Yody & Hasaki!")
}
