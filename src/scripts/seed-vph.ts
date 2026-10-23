/**
 * ═══════════════════════════════════════════════════════════════════════
 *  VP Holding — Seed pilot: 100 SKU rau củ quả lên men
 *  Chạy: docker compose exec medusa npx medusa exec ./src/scripts/seed-vph.ts
 *  Idempotent: chạy lại sẽ bỏ qua phần đã có.
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
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  createApiKeysWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"

// ─────────────────────────── Danh mục sản phẩm ──────────────────────────
type Item = { ten: string; nhom: string; mota: string; gia: number }

const CATALOG: Item[] = [
  { ten: "Dưa cải muối chua",        nhom: "Dưa muối truyền thống", gia: 45000,  mota: "Cải bẹ xanh muối theo lối truyền thống miền Bắc, lên men tự nhiên, chua thanh, giòn." },
  { ten: "Dưa cải bẹ xanh",          nhom: "Dưa muối truyền thống", gia: 48000,  mota: "Cải bẹ xanh non muối nén, vị chua dịu, ăn kèm thịt kho." },
  { ten: "Dưa bắp cải muối",         nhom: "Dưa muối truyền thống", gia: 42000,  mota: "Bắp cải thái sợi muối chua, giòn ngọt, lên men lactic tự nhiên." },
  { ten: "Dưa món thập cẩm",         nhom: "Dưa muối truyền thống", gia: 65000,  mota: "Su hào, cà rốt, đu đủ, củ kiệu ngâm nước mắm đường — món Tết miền Trung." },
  { ten: "Rau muống chua",           nhom: "Dưa muối truyền thống", gia: 40000,  mota: "Cọng rau muống chẻ muối chua, giòn sần sật." },
  { ten: "Kim chi cải thảo",         nhom: "Kim chi",               gia: 89000,  mota: "Cải thảo ướp ớt bột Hàn Quốc, tỏi, gừng, lên men chậm 72 giờ." },
  { ten: "Kim chi củ cải",           nhom: "Kim chi",               gia: 85000,  mota: "Củ cải trắng cắt khối, kkakdugi kiểu Hàn, giòn và cay nhẹ." },
  { ten: "Kim chi dưa chuột",        nhom: "Kim chi",               gia: 82000,  mota: "Dưa chuột nhồi nhân hẹ và ớt, oi-sobagi, tươi mát." },
  { ten: "Kim chi hành lá",          nhom: "Kim chi",               gia: 78000,  mota: "Hành lá nguyên cọng ướp ớt, pa-kimchi, hương nồng đặc trưng." },
  { ten: "Kim chi chay",             nhom: "Kim chi",               gia: 86000,  mota: "Không mắm cá, không hành tỏi — dành cho người ăn chay." },
  { ten: "Cà pháo muối",             nhom: "Cà muối",               gia: 52000,  mota: "Cà pháo trắng muối nén, giòn tan, chua dịu." },
  { ten: "Cà pháo mắm tôm",          nhom: "Cà muối",               gia: 58000,  mota: "Cà pháo muối xổi trộn mắm tôm, riềng, ớt." },
  { ten: "Cà bát muối",              nhom: "Cà muối",               gia: 55000,  mota: "Cà bát thái miếng muối chua, đậm vị đồng quê Bắc Bộ." },
  { ten: "Dưa chuột muối",           nhom: "Rau củ ngâm",           gia: 46000,  mota: "Dưa chuột baby muối nguyên trái với thì là, tỏi." },
  { ten: "Su hào muối",              nhom: "Rau củ ngâm",           gia: 44000,  mota: "Su hào thái con chì muối chua ngọt, giòn." },
  { ten: "Cà rốt ngâm chua ngọt",    nhom: "Rau củ ngâm",           gia: 43000,  mota: "Cà rốt bào sợi ngâm giấm đường, ăn kèm bánh mì." },
  { ten: "Củ cải trắng ngâm",        nhom: "Rau củ ngâm",           gia: 41000,  mota: "Củ cải trắng ngâm chua ngọt, giòn mát." },
  { ten: "Đu đủ ngâm chua ngọt",     nhom: "Rau củ ngâm",           gia: 47000,  mota: "Đu đủ xanh bào sợi ngâm giấm, dùng cho nộm." },
  { ten: "Ngó sen ngâm chua",        nhom: "Rau củ ngâm",           gia: 72000,  mota: "Ngó sen non ngâm giấm đường, trắng giòn." },
  { ten: "Nấm ngâm chua",            nhom: "Rau củ ngâm",           gia: 68000,  mota: "Nấm rơm và nấm sò ngâm chua, dai giòn." },
  { ten: "Măng chua",                nhom: "Măng lên men",          gia: 54000,  mota: "Măng tre lên men tự nhiên, chua nhẹ, nấu canh cá." },
  { ten: "Măng ớt",                  nhom: "Măng lên men",          gia: 56000,  mota: "Măng thái sợi ngâm ớt tươi, cay nồng kiểu Tây Bắc." },
  { ten: "Hành tím muối",            nhom: "Gia vị lên men",        gia: 62000,  mota: "Hành tím Lý Sơn muối chua, ăn kèm bánh chưng." },
  { ten: "Kiệu muối",                nhom: "Gia vị lên men",        gia: 75000,  mota: "Củ kiệu Huế muối đường, trắng giòn, món Tết." },
  { ten: "Tỏi đen lên men",          nhom: "Gia vị lên men",        gia: 185000, mota: "Tỏi cô đơn Lý Sơn lên men 60 ngày ở 60°C, ngọt dẻo như ô mai." },
]

const SIZES = [
  { ten: "200g",  heso: 1.0, gam: 200 },
  { ten: "350g",  heso: 1.6, gam: 350 },
  { ten: "500g",  heso: 2.2, gam: 500 },
  { ten: "1kg",   heso: 4.0, gam: 1000 },
]

const slug = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
   .replace(/đ/g, "d").replace(/Đ/g, "D")
   .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

export default async function seedVPH({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const link   = container.resolve(ContainerRegistrationKeys.LINK)
  const query  = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillmentService  = container.resolve(Modules.FULFILLMENT)
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL)
  const storeService        = container.resolve(Modules.STORE)

  const countries = ["vn"]

  // ---------------------------------------------------------- Sales channel
  logger.info("→ Kênh bán (sales channel)…")
  const [store] = await storeService.listStores()
  let channels = await salesChannelService.listSalesChannels({ name: "VPH Việt Nam" })
  if (!channels.length) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: "VPH Việt Nam" }] },
    })
    channels = result
  }
  const channel = channels[0]

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        supported_currencies: [{ currency_code: "vnd", is_default: true }],
        default_sales_channel_id: channel.id,
      },
    },
  })
  logger.info("  ✓ Kênh 'VPH Việt Nam' · tiền tệ VND")

  // ---------------------------------------------------------------- Region
  logger.info("→ Thị trường (region)…")
  const { data: existingRegions } = await query.graph({
    entity: "region", fields: ["id", "name"], filters: {},
  })
  let regionId = existingRegions?.find((r: any) => r.name === "Việt Nam")?.id
  if (!regionId) {
    const { result } = await createRegionsWorkflow(container).run({
      input: {
        regions: [{
          name: "Việt Nam",
          currency_code: "vnd",
          countries,
          payment_providers: ["pp_system_default"],
        }],
      },
    })
    regionId = result[0].id
    await createTaxRegionsWorkflow(container).run({
      input: countries.map((c) => ({ country_code: c, provider_id: "tp_system" })),
    })
  }
  logger.info("  ✓ Region 'Việt Nam' · VND · country vn")

  // -------------------------------------------------------- Stock location
  logger.info("→ Kho hàng (stock location)…")
  const { data: existingLocs } = await query.graph({
    entity: "stock_location", fields: ["id", "name"], filters: {},
  })
  let locId = existingLocs?.find((l: any) => l.name === "Kho Trung Tâm TP.HCM")?.id
  if (!locId) {
    const { result } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [{
          name: "Kho Trung Tâm TP.HCM",
          address: { city: "Hồ Chí Minh", country_code: "VN", address_1: "" },
        }],
      },
    })
    locId = result[0].id
    await updateStoresWorkflow(container).run({
      input: { selector: { id: store.id }, update: { default_location_id: locId } },
    })
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: locId },
      [Modules.FULFILLMENT]:    { fulfillment_provider_id: "manual_manual" },
    })
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: { id: locId, add: [channel.id] },
    })
  }
  logger.info("  ✓ Kho Trung Tâm TP.HCM")

  // -------------------------------------------------------- Shipping
  logger.info("→ Vận chuyển (shipping)…")
  let profiles = await fulfillmentService.listShippingProfiles({ type: "default" })
  if (!profiles.length) {
    const { result } = await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: "Mặc định", type: "default" }] },
    })
    profiles = result as any
  }
  const shippingProfile = profiles[0]

  const existingSets = await fulfillmentService.listFulfillmentSets({
    name: "Giao hàng Việt Nam",
  })
  if (!existingSets.length) {
    const set = await fulfillmentService.createFulfillmentSets({
      name: "Giao hàng Việt Nam",
      type: "shipping",
      service_zones: [{
        name: "Toàn quốc",
        geo_zones: [{ country_code: "vn", type: "country" }],
      }],
    })
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: locId },
      [Modules.FULFILLMENT]:    { fulfillment_set_id: set.id },
    })
  }
  logger.info("  ✓ Vùng giao hàng: toàn quốc VN")

  // -------------------------------------------------------- API key
  logger.info("→ Khoá API công khai (publishable key)…")
  const { data: keys } = await query.graph({
    entity: "api_key", fields: ["id", "title", "token"], filters: { type: "publishable" },
  })
  // Không tái dùng key đầu tiên: một publishable key gắn nhiều sales channel sẽ
  // khiến Store API không thể tự xác định kênh khi tính tồn kho/tạo cart.
  let apiKey = keys?.find((key: any) => key.title === "Storefront VN")
  if (!apiKey) {
    const { result } = await createApiKeysWorkflow(container).run({
      input: { api_keys: [{ title: "Storefront VN", type: "publishable", created_by: "" }] },
    })
    apiKey = result[0] as any
  }
  if (!apiKey) {
    throw new Error("Không tạo được publishable key riêng cho Storefront VN")
  }
  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: { id: apiKey.id, add: [channel.id] },
  })

  // -------------------------------------------------------- Categories
  logger.info("→ Danh mục (categories)…")
  const nhomList = [...new Set(CATALOG.map((i) => i.nhom))]
  const { data: existingCats } = await query.graph({
    entity: "product_category", fields: ["id", "name"], filters: {},
  })
  const catMap = new Map<string, string>()
  ;(existingCats || []).forEach((c: any) => catMap.set(c.name, c.id))

  const toCreate = nhomList.filter((n) => !catMap.has(n))
  if (toCreate.length) {
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: { product_categories: toCreate.map((name) => ({ name, is_active: true })) },
    })
    result.forEach((c: any) => catMap.set(c.name, c.id))
  }
  logger.info(`  ✓ ${nhomList.length} danh mục`)

  // -------------------------------------------------------- Products
  logger.info("→ Sản phẩm: 25 mặt hàng × 4 quy cách = 100 SKU…")
  const { data: existingProds } = await query.graph({
    entity: "product", fields: ["id", "handle"], filters: {},
  })
  const haveHandles = new Set((existingProds || []).map((p: any) => p.handle))

  const products = CATALOG
    .map((item, idx) => {
      const handle = slug(item.ten)
      if (haveHandles.has(handle)) return null
      const code = String(idx + 1).padStart(2, "0")
      return {
        title: item.ten,
        handle,
        description: item.mota,
        status: ProductStatus.PUBLISHED,
        category_ids: [catMap.get(item.nhom)!],
        shipping_profile_id: shippingProfile.id,
        weight: 500,
        options: [{ title: "Quy cách", values: SIZES.map((s) => s.ten) }],
        variants: SIZES.map((s) => ({
          title: `${item.ten} — ${s.ten}`,
          sku: `VPH-FERM-${code}-${s.ten.toUpperCase()}`,
          weight: s.gam,
          manage_inventory: true,
          options: { "Quy cách": s.ten },
          prices: [{
            amount: Math.round((item.gia * s.heso) / 1000) * 1000,
            currency_code: "vnd",
          }],
        })),
        sales_channels: [{ id: channel.id }],
      }
    })
    .filter(Boolean) as any[]

  if (products.length) {
    // Chia lô 5 sản phẩm/lần — tránh ngốn RAM trên VPS 4GB
    for (let i = 0; i < products.length; i += 5) {
      const batch = products.slice(i, i + 5)
      await createProductsWorkflow(container).run({ input: { products: batch } })
      logger.info(`  … ${Math.min(i + 5, products.length)}/${products.length} sản phẩm`)
    }
    logger.info(`  ✓ Đã tạo ${products.length} sản phẩm · ${products.length * 4} SKU`)
  } else {
    logger.info("  ✓ Sản phẩm đã có từ trước — bỏ qua")
  }

  logger.info("")
  logger.info("═══════════════════════════════════════════")
  logger.info(" SEED HOÀN TẤT")
  logger.info(`  Publishable key : ${(apiKey as any).token ?? "(xem Admin → Developer)"}`)
  logger.info("═══════════════════════════════════════════")
}
