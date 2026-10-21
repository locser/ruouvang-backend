/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  NẠP DỮ LIỆU THẬT CHO SHOP C.W. WINES (rượu vang & rượu mạnh)
 *
 *  Nguồn: `scripts/scrapers/crawl-cwwines.js` cào từ cwwines.com (Shopify):
 *  185 sản phẩm, 58 bộ sưu tập, 221 URL ảnh duy nhất và 197 biến thể tại 18/08/2026.
 *
 *  Chạy TRONG container của C.W. Wines (không phải shop khác):
 *    docker exec -e SO_LUONG=10 medusa-backend-cwwines sh -c \
 *      "cd /app/apps/backend && npx medusa exec ./src/scripts/seed-cwwines.ts"
 *
 *  Tham số (đọc từ BIẾN MÔI TRƯỜNG — `medusa exec -- --co` không truyền args
 *  qua nguyên vẹn ở 2.17.2):
 *    SO_LUONG   giới hạn số sản phẩm (bỏ trống = nạp hết)
 *    LO         số sản phẩm mỗi lô workflow (mặc định 30)
 *    CHI_XEM    "1" = chỉ in dự định + bảng giá, không tạo gì
 *
 *  ⚠️ LUÔN chạy `SO_LUONG=10 CHI_XEM=1` và soi bảng AUD → VND trước khi nạp.
 *  VND là zero-decimal: 3440000 nghĩa là 3.440.000đ, KHÔNG chia cho 100.
 *
 *  Idempotent theo `handle`: chạy lại bỏ qua sản phẩm/danh mục đã có.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { CreateInventoryLevelInput, ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateProductsWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"
import * as fs from "fs"
import * as path from "path"

// Dùng đúng module quy tắc của storefront/sitemap. `require` có khai kiểu tại
// chỗ để TypeScript backend không kéo mã ngoài `rootDir` vào đầu ra biên dịch.
const quyTacSanPham = require("../../../storefront-cwwines/src/lib/san-pham-ban-duoc") as {
  TY_GIA_AUD_VND: number
  audSangVnd: (giaAud: unknown) => number
  bienTheBanDuoc: (bienThe: { priceAud?: unknown; price?: unknown }) => boolean
  sanPhamBanDuoc: (sanPham: {
    priceAud?: unknown
    price?: unknown
    variants?: Array<{ priceAud?: unknown; price?: unknown }>
  }) => boolean
}
const { audSangVnd, bienTheBanDuoc, sanPhamBanDuoc } = quyTacSanPham

const THU_MUC_DATA = "/app/scripts/scrapers/data"
export const TY_GIA_AUD_VND = quyTacSanPham.TY_GIA_AUD_VND
const FILE_SAN_PHAM = "cwwines-products.jsonl"
const FILE_DANH_MUC = "cwwines-categories.json"
const FILE_THEME = "cwwines-theme.json"

const TEN_SHOP = "C.W. Wines"
const TEN_KENH_BAN = "C.W. Wines Storefront"
const TEN_KHOA = "C.W. Wines Storefront"

/** Dấu để lần chạy sau phân biệt danh mục do script này tạo. */
const NGUON_DANH_MUC = "crawl-cwwines"

// ─────────────────────────────────────────────────────────────────────────────
// Kiểu dữ liệu của file JSONL do crawler sinh ra
// ─────────────────────────────────────────────────────────────────────────────

interface BienTheCao {
  sku: string
  title: string
  option1: string | null
  option2: string | null
  option3: string | null
  price: number
  priceAud: number
  originalPrice: number | null
  originalPriceAud: number | null
  inventoryQuantity: number
  available: boolean
  weightGram: number
  barcode: string | null
}

interface SanPhamCao {
  site: "cwwines"
  url: string
  handle: string
  title: string
  description: string
  descriptionVi: string
  brand: string | null
  productType: string | null
  price: number
  priceAud: number
  originalPrice: number | null
  available: boolean
  images: string[]
  options: { name: string; values: string[] }[]
  variants: BienTheCao[]
  tags: string[]
  /** Thuộc tính nguồn Shopify: country, grape, capacity, abv, region… */
  thuocTinh: Record<string, string[]>
  /** Handle các bộ sưu tập mà sản phẩm này thuộc về. */
  collections: string[]
}

interface BoSuuTapCao {
  handle: string
  title: string
  description: string
  image: string | null
  soSanPham: number
}

/** Một mục trong cây menu của cwwines-theme.json. */
interface MucMenu {
  ten: string
  tenEn?: string
  handle: string
  cot?: { ten: string; handle: string; muc?: { ten: string; handle: string }[] }[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiện ích
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Giá về số nguyên VND.
 *
 * ⚠️ ADR-010: VND zero-decimal. 3440000 là 3.440.000đ. Sai chỗ này là sai
 * lệch 100 lần trên MỌI đơn hàng, và không có lỗi nào báo ra.
 */
function tienVND(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.]/g, ""))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n)
}

function doc<T>(ten: string): T {
  const p = path.join(THU_MUC_DATA, ten)
  if (!fs.existsSync(p)) {
    throw new Error(
      `Không có ${p}.\nChạy trước trên máy host:\n` +
        `  node "AI ECommerce Brain/scripts/scrapers/crawl-cwwines.js"`
    )
  }
  return JSON.parse(fs.readFileSync(p, "utf-8")) as T
}

function docJsonl(ten: string): SanPhamCao[] {
  const p = path.join(THU_MUC_DATA, ten)
  if (!fs.existsSync(p)) {
    throw new Error(
      `Không có ${p}.\nChạy trước trên máy host:\n` +
        `  node "AI ECommerce Brain/scripts/scrapers/crawl-cwwines.js"`
    )
  }
  const ra: SanPhamCao[] = []
  let hong = 0
  for (const dong of fs.readFileSync(p, "utf-8").split("\n")) {
    const t = dong.trim()
    if (!t) continue
    try {
      ra.push(JSON.parse(t))
    } catch {
      hong++
    }
  }
  if (hong > 0) console.warn(`[ĐọcNguồn] ${hong} dòng JSONL hỏng, đã bỏ qua`)
  return ra
}

// ─────────────────────────────────────────────────────────────────────────────
// Nền cửa hàng: region VND, kênh bán, kho, hồ sơ vận chuyển, khoá công khai
// ─────────────────────────────────────────────────────────────────────────────

async function dungNenCuaHang(container: any, logger: any) {
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
  const storeModule = container.resolve(Modules.STORE)

  let [channel] = await salesChannelModule.listSalesChannels({ name: TEN_KENH_BAN })
  if (!channel) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: TEN_KENH_BAN }] },
    })
    channel = result[0]
  }

  const [store] = await storeModule.listStores()
  if (store) {
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: store.id },
        update: {
          name: TEN_SHOP,
          supported_currencies: [{ currency_code: "vnd", is_default: true }],
          default_sales_channel_id: channel.id,
        },
      },
    })
  }

  const regionModule = container.resolve(Modules.REGION)
  let [region] = await regionModule.listRegions({ name: "Việt Nam" })
  if (!region) {
    const { result } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "Việt Nam",
            currency_code: "vnd",
            countries: ["vn"],
            payment_providers: ["pp_system_default"],
          },
        ],
      },
    })
    region = result[0]
    // ⚠️ PHẢI chỉ rõ `provider_id`.
    //
    // Bỏ trống thì `tax_region.provider_id` là NULL và Medusa ném lỗi ngay khi
    // khách thêm món đầu tiên vào giỏ:
    //     Unable to retrieve the tax provider with id: null
    // Sản phẩm tìm được, giá đọc được, nhưng KHÔNG BÁN ĐƯỢC GÌ — và thông báo
    // lỗi không hề nhắc tới thuế nên rất dễ đi tìm nhầm hướng.
    await createTaxRegionsWorkflow(container).run({
      input: [{ country_code: "vn", provider_id: "tp_system" }],
    })
  }

  const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
  let [shippingProfile] = await fulfillmentModule.listShippingProfiles({ type: "default" })
  if (!shippingProfile) {
    const { result } = await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: "Mặc định", type: "default" }] },
    })
    shippingProfile = result[0]
  }

  const stockModule = container.resolve(Modules.STOCK_LOCATION)
  let [stockLocation] = await stockModule.listStockLocations({ name: "Kho chính" })
  if (!stockLocation) {
    const { result } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: "Kho chính",
            // Kho vận hành tại Việt Nam; địa chỉ cụ thể cập nhật khi deploy.
            address: { city: "Hà Nội", country_code: "vn", address_1: "VP Holding" },
          },
        ],
      },
    })
    stockLocation = result[0]
  }
  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: { id: stockLocation.id, add: [channel.id] },
  })

  const apiKeyModule = container.resolve(Modules.API_KEY)
  let [apiKey] = await apiKeyModule.listApiKeys({
    type: "publishable",
    title: TEN_KHOA,
  })
  if (!apiKey) {
    const { result } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [{ title: TEN_KHOA, type: "publishable", created_by: "seed-cwwines" }],
      },
    })
    apiKey = result[0]
  }

  // ⚠️ NỐI KHOÁ VỚI KÊNH BÁN Ở NGOÀI NHÁNH `if (!apiKey)`.
  //
  // Backend Medusa tự dựng sẵn "Default Sales Channel" + một publishable key
  // nối vào đó ngay lần khởi động đầu. Script tạo kênh riêng "C.W. Wines Fine
  // Wines" và gắn sản phẩm vào kênh đó, nhưng `listApiKeys` lại tìm thấy khoá
  // mặc định nên nhánh tạo-mới không chạy, và khoá không bao giờ được nối với
  // kênh mới. Kết quả: `/store/products` trả về **0 sản phẩm, HTTP 200, không
  // một lời cảnh báo** dù CSDL có đủ hàng — đúng kiểu lỗi câm đã mất hai ngày
  // ở shop khác. Nối lại mỗi lần chạy; workflow này idempotent.
  // ⚠️ VÀ PHẢI GỠ CÁC KÊNH KHÁC RA, không chỉ thêm kênh của mình.
  //
  // Medusa dựng sẵn "Default Sales Channel" và nối khoá mặc định vào đó. Nếu
  // chỉ `add` kênh C.W. Wines thì khoá mang HAI kênh, và `POST /store/carts`
  // trả lỗi 400:
  //     "Cannot assign sales channel to cart. The Publishable API Key in the
  //      header has multiple associated sales channels."
  // Trang sản phẩm vẫn hiện đủ hàng, giá vẫn đúng — chỉ **không tạo được giỏ
  // hàng**, tức tắc ngay bước đầu của phễu mua. Đây là lỗi chỉ lộ ra khi bấm
  // "thêm vào giỏ" thật, không lộ ra khi xem trang.
  const kenhKhac = (await salesChannelModule.listSalesChannels({}))
    .map((k: any) => k.id)
    .filter((id: string) => id !== channel.id)

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: { id: apiKey.id, add: [channel.id], remove: kenhKhac },
  })
  logger.info(
    `  ✓ Khoá ${apiKey.id} chỉ còn nối với kênh bán ${channel.id}` +
      (kenhKhac.length ? ` (đã gỡ ${kenhKhac.length} kênh khác)` : "")
  )

  logger.info(`  ✓ Nền cửa hàng sẵn sàng · kênh bán ${channel.id}`)
  return { channel, shippingProfile, apiKey, region, stockLocation }
}

/**
 * Tạo trọn đường vận chuyển: provider ↔ kho ↔ fulfillment set/service zone ↔
 * shipping option có giá. Thiếu bất kỳ mắt xích nào checkout sẽ không có lựa
 * chọn giao hàng dù catalog và giỏ hàng vẫn hoạt động bình thường.
 */
async function dungVanChuyen(
  container: any,
  logger: any,
  stockLocation: any,
  region: any,
  shippingProfile: any
) {
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const fulfillment = container.resolve(Modules.FULFILLMENT)

  const providerLinks = await link.list({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
  })
  if (!providerLinks.length) {
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
    })
  }

  const TEN_BO = "C.W. Wines - Giao hàng Việt Nam"
  let [fulfillmentSet] = await fulfillment.listFulfillmentSets(
    { name: TEN_BO },
    { relations: ["service_zones"] }
  )
  if (!fulfillmentSet) {
    fulfillmentSet = await fulfillment.createFulfillmentSets({
      name: TEN_BO,
      type: "shipping",
      service_zones: [
        {
          name: "Việt Nam",
          geo_zones: [{ country_code: "vn", type: "country" }],
        },
      ],
    })
  }
  const serviceZoneId = fulfillmentSet.service_zones?.[0]?.id
  if (!serviceZoneId) throw new Error("Fulfillment set không có service zone Việt Nam")

  const setLinks = await link.list({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
  })
  if (!setLinks.length) {
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
    })
  }

  const daCo = await fulfillment.listShippingOptions({ service_zone_id: serviceZoneId })
  if (!daCo.some((o: any) => o.name === "Giao hàng tiêu chuẩn C.W. Wines")) {
    await createShippingOptionsWorkflow(container).run({
      input: [
        {
          name: "Giao hàng tiêu chuẩn C.W. Wines",
          price_type: "flat" as const,
          provider_id: "manual_manual",
          service_zone_id: serviceZoneId,
          shipping_profile_id: shippingProfile.id,
          type: {
            label: "Tiêu chuẩn",
            description: "Giao hàng dự kiến 2-4 ngày làm việc.",
            code: "cwwines-standard",
          },
          prices: [{ region_id: region.id, amount: 50000 }],
          rules: [
            { attribute: "enabled_in_store", value: "true", operator: "eq" as const },
            { attribute: "is_return", value: "false", operator: "eq" as const },
          ],
        },
      ],
    })
  }
  logger.info(`  ✓ Vận chuyển sẵn sàng · phí tiêu chuẩn ${tienVND(50000).toLocaleString("vi-VN")}đ`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Cây danh mục
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dựng cây danh mục.
 *
 * Shopify trả 58 bộ sưu tập phẳng, không có quan hệ cha–con. Cấu trúc cha–con
 * chỉ tồn tại trong **mega menu** của theme, nên cây được suy ra từ
 * `cwwines-theme.json`:
 *
 *   cấp 1 = mục menu chính  (RƯỢU VANG, BORDEAUX, CHAMPAGNE…)
 *   cấp 2 = cột trong mega menu  (Loại rượu, Giá bán, Quốc gia, Giống nho…)
 *   cấp 3 = mục trong cột  (Rượu vang đỏ, Merlot, Pauillac…)
 *
 * ⚠️ MỘT HANDLE CHỈ ĐƯỢC MỘT CHA. Menu gốc dùng lại cùng một bộ sưu tập ở
 * nhiều chỗ — `champagne` vừa là mục menu chính vừa nằm trong cột "Loại rượu",
 * `ruou-vang` vừa là gốc vừa là "Tất cả rượu vang" trong cột "Giống nho".
 * Medusa bắt `handle` duy nhất, và gán cha hai lần sẽ tạo vòng lặp cha–con.
 * Nên duyệt theo cấp và **lần gán đầu tiên thắng**: cấp 1 xong mới tới cấp 2,
 * cấp 2 xong mới tới cấp 3. Nhờ thứ tự đó `champagne` ở lại làm danh mục gốc.
 *
 * Menu site có thể chỉ phủ một phần collection; số còn lại (thương hiệu riêng như `chateau-lafleur`,
 * `vega-sicilia`…) thành danh mục gốc — không lên menu nhưng vẫn vào được bằng
 * `/danh-muc/<handle>`, đúng như site gốc.
 */
async function taoCayDanhMuc(
  container: any,
  boSuuTap: BoSuuTapCao[],
  menu: MucMenu[],
  logger: any,
  chiXem: boolean
): Promise<Map<string, string>> {
  const productModule = container.resolve(Modules.PRODUCT)

  const tenTheoHandle = new Map<string, string>()
  for (const b of boSuuTap) tenTheoHandle.set(b.handle, b.title)

  /** handle → handle cha (null = gốc). Lần gán đầu tiên thắng. */
  const cha = new Map<string, string | null>()
  const capCua = new Map<string, number>()

  const dat = (handle: string, ten: string, handleCha: string | null, cap: number) => {
    if (!handle) return
    if (!tenTheoHandle.has(handle)) tenTheoHandle.set(handle, ten)
    if (cha.has(handle)) return // đã có cha rồi — không thay đổi
    cha.set(handle, handleCha)
    capCua.set(handle, cap)
  }

  // Cấp 1 — mục menu chính
  for (const m of menu) dat(m.handle, m.ten, null, 1)
  // Cấp 2 — cột trong mega menu
  for (const m of menu) {
    for (const c of m.cot ?? []) dat(c.handle, c.ten, m.handle, 2)
  }
  // Cấp 3 — mục trong cột
  for (const m of menu) {
    for (const c of m.cot ?? []) {
      for (const muc of c.muc ?? []) dat(muc.handle, muc.ten, c.handle, 3)
    }
  }
  // Bộ sưu tập không có trong menu → danh mục gốc
  for (const b of boSuuTap) dat(b.handle, b.title, null, 1)

  const theoCap: Map<string, { ten: string; handleCha: string | null }>[] = [
    new Map(),
    new Map(),
    new Map(),
  ]
  for (const [h, hc] of cha) {
    const cap = capCua.get(h) ?? 1
    theoCap[cap - 1].set(h, { ten: tenTheoHandle.get(h) ?? h, handleCha: hc })
  }

  logger.info(
    `  Danh mục cần có: ${cha.size} ` +
      `(cấp 1: ${theoCap[0].size} · cấp 2: ${theoCap[1].size} · cấp 3: ${theoCap[2].size})`
  )
  if (chiXem) return new Map()

  // Danh mục đã tồn tại — chạy lại lần hai thì dùng lại, không tạo trùng.
  //
  // ⚠️ PHẢI khai `select` rõ ràng. Không khai thì module vẫn trả đủ số bản ghi
  // nhưng `handle` là `undefined`, bảng tra rỗng, và lần chạy sau đi tạo lại
  // toàn bộ danh mục đã có → lỗi hàng loạt "already exists".
  const daCo = await productModule.listProductCategories(
    {},
    { select: ["id", "handle"], take: null }
  )
  const mapHandleId = new Map<string, string>()
  for (const c of daCo ?? []) if (c.handle) mapHandleId.set(c.handle, c.id)

  for (let cap = 0; cap < theoCap.length; cap++) {
    const canTao: any[] = []
    for (const [h, info] of theoCap[cap]) {
      if (mapHandleId.has(h)) continue
      canTao.push({
        name: info.ten,
        handle: h,
        is_active: true,
        parent_category_id: info.handleCha ? mapHandleId.get(info.handleCha) ?? null : null,
        metadata: { nguon: NGUON_DANH_MUC, shop: "cwwines", cap: cap + 1 },
      })
    }
    if (canTao.length === 0) continue

    // Lô nhỏ: một danh mục lỗi không kéo cả cấp chết theo.
    for (let j = 0; j < canTao.length; j += 50) {
      const lo = canTao.slice(j, j + 50)
      try {
        const { result } = await createProductCategoriesWorkflow(container).run({
          input: { product_categories: lo },
        })
        for (const c of result) mapHandleId.set(c.handle, c.id)
      } catch (e: any) {
        logger.warn(
          `  ⚠ Lô danh mục cấp ${cap + 1} hỏng, thử từng cái: ` +
            String(e?.message ?? e).slice(0, 120)
        )
        for (const dm of lo) {
          try {
            const { result } = await createProductCategoriesWorkflow(container).run({
              input: { product_categories: [dm] },
            })
            mapHandleId.set(result[0].handle, result[0].id)
          } catch (e2: any) {
            logger.error(
              `    ✖ danh mục ${dm.handle}: ${String(e2?.message ?? e2).slice(0, 120)}`
            )
          }
        }
      }
    }
    logger.info(`  ✓ Cấp ${cap + 1}: xong ${theoCap[cap].size} danh mục`)
  }

  return mapHandleId
}

// ─────────────────────────────────────────────────────────────────────────────
// Dựng payload sản phẩm
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Một sản phẩm đã cào → payload của createProductsWorkflow.
 *
 * Ràng buộc Medusa v2 phải tôn trọng:
 *   - Sản phẩm phải có ít nhất 1 option, và MỌI biến thể phải khai đủ giá trị
 *     cho TẤT CẢ option đã khai.
 *   - Không được có hai biến thể trùng tổ hợp option.
 *   - SKU duy nhất trên toàn cửa hàng.
 */
function dungPayload(
  sp: SanPhamCao,
  idDanhMuc: string[],
  idKenh: string,
  idShippingProfile: string
) {
  const tuyChonNguon = sp.options?.length
    ? sp.options
    : [{ name: "Title", values: ["Default Title"] }]
  const tenTuyChon = tuyChonNguon.map((o, i) => o.name?.trim() || `Option ${i + 1}`)

  const bienThe = sp.variants
    // Gift card/biến thể mở giá 0 AUD không được đưa lên bán ở giá 0đ.
    .filter(bienTheBanDuoc)
    .map((v, i) => ({
      title: `${sp.title} — ${v.title || "Default Title"}`.slice(0, 250),
      sku: v.sku,
      // Bắt buộc bật quản lý kho và tạo inventory_level sau khi nạp.
      manage_inventory: true,
      allow_backorder: false,
      weight: v.weightGram || undefined,
      barcode: v.barcode ?? undefined,
      options: Object.fromEntries(
        tenTuyChon.map((ten, j) => [
          ten,
          String([v.option1, v.option2, v.option3][j] ?? tuyChonNguon[j]?.values?.[0] ?? v.title ?? `Giá trị ${i + 1}`),
        ])
      ),
      prices: [{ amount: audSangVnd(v.priceAud), currency_code: "vnd" }],
    }))

  return {
    title: sp.title,
    handle: sp.handle,
    description: sp.descriptionVi || sp.description,
    status: ProductStatus.PUBLISHED,
    shipping_profile_id: idShippingProfile,
    thumbnail: sp.images[0] || null,
    images: sp.images.slice(0, 8).map((url) => ({ url })),
    options: tenTuyChon.map((ten, i) => ({
      title: ten,
      values: Array.from(
        new Set(
          sp.variants
            .filter(bienTheBanDuoc)
            .map((v) => String([v.option1, v.option2, v.option3][i] ?? tuyChonNguon[i]?.values?.[0] ?? v.title))
        )
      ),
    })),
    variants: bienThe,
    sales_channels: [{ id: idKenh }],
    // Không dựa vào category_ids/categories trong create: Medusa v2 từng bỏ
    // im lặng. Bước sau sẽ updateProductsWorkflow và đọc lại xác nhận.
    metadata: {
      specs: {
        store_type: "cwwines",
        thuong_hieu: sp.brand,
        loai: sp.productType,
        tags: sp.tags,
      },
      url_goc: sp.url,
      price_aud: sp.priceAud,
      ty_gia_aud_vnd: TY_GIA_AUD_VND,
      description_en: sp.description,
      description_vi: sp.descriptionVi || null,
      category_ids_du_kien: idDanhMuc,
      ton_kho_nguon: sp.variants[0]?.inventoryQuantity ?? 0,
      ton_kho_uoc_tinh: true,
      gia_goc: sp.originalPrice ?? null,
    },
  }
}

/** Gắn danh mục bằng update riêng rồi đọc lại; không tin create đã nhận. */
async function ganDanhMucVaXacNhan(
  container: any,
  canTao: { sp: SanPhamCao; danhMuc: string[] }[],
  logger: any
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const mongMuon = new Map(canTao.map((x) => [x.sp.handle, x.danhMuc]))
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "categories.id"],
    filters: {},
    pagination: { take: 1000, skip: 0 },
  })
  const capNhat = (data ?? [])
    .filter((p: any) => mongMuon.has(p.handle))
    .map((p: any) => ({
      id: p.id,
      categories: (mongMuon.get(p.handle) ?? []).map((id) => ({ id })),
    }))
    .filter((p: any) => p.categories.length > 0)

  for (let i = 0; i < capNhat.length; i += 30) {
    await updateProductsWorkflow(container).run({
      input: { products: capNhat.slice(i, i + 30) as any },
    })
  }

  const { data: docLai } = await query.graph({
    entity: "product",
    fields: ["handle", "categories.id"],
    filters: {},
    pagination: { take: 1000, skip: 0 },
  })
  const daGan = (docLai ?? []).filter(
    (p: any) => mongMuon.has(p.handle) && (p.categories?.length ?? 0) > 0
  ).length
  const canGan = canTao.filter((x) => x.danhMuc.length > 0).length
  if (daGan !== canGan) {
    throw new Error(`Xác nhận danh mục thất bại: ${daGan}/${canGan} sản phẩm có danh mục`)
  }
  logger.info(`  ✓ Đã gắn và đọc lại xác nhận danh mục cho ${daGan} sản phẩm`)
}

/** Tạo inventory_level thật cho từng biến thể manage_inventory=true. */
async function taoTonKho(
  container: any,
  canTao: { sp: SanPhamCao; danhMuc: string[] }[],
  stockLocation: any,
  logger: any
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const inventory = container.resolve(Modules.INVENTORY)
  const soLuongTheoSku = new Map<string, number>()
  for (const { sp } of canTao) {
    for (const v of sp.variants) {
      if (bienTheBanDuoc(v)) {
        soLuongTheoSku.set(v.sku, Math.max(0, v.inventoryQuantity))
      }
    }
  }

  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "manage_inventory", "inventory_items.inventory_item_id"],
    filters: {},
    pagination: { take: 1000, skip: 0 },
  })
  const levels: CreateInventoryLevelInput[] = []
  for (const v of variants ?? []) {
    if (!soLuongTheoSku.has(v.sku)) continue
    const itemId = v.inventory_items?.[0]?.inventory_item_id
    if (!itemId) {
      logger.warn(`  ⚠ Biến thể ${v.sku} chưa có inventory item`)
      continue
    }
    const daCo = await inventory.listInventoryLevels({
      inventory_item_id: itemId,
      location_id: stockLocation.id,
    })
    if (daCo.length) continue
    levels.push({
      inventory_item_id: itemId,
      location_id: stockLocation.id,
      stocked_quantity: soLuongTheoSku.get(v.sku) ?? 0,
    })
  }
  for (let i = 0; i < levels.length; i += 100) {
    await createInventoryLevelsWorkflow(container).run({
      input: { inventory_levels: levels.slice(i, i + 100) },
    })
  }
  logger.info(`  ✓ Đã tạo ${levels.length} bản ghi tồn kho tại ${stockLocation.name}`)
}

function inBangGia(ds: SanPhamCao[], logger: any) {
  logger.info("")
  logger.info("┌─ ĐỐI CHIẾU GIÁ — AUD gốc × 17.500, làm tròn lên 1.000đ")
  for (const sp of ds.slice(0, 10)) {
    const v = sp.variants.find(bienTheBanDuoc) ?? sp.variants[0]
    if (!v) continue
    logger.info(
      `│ ${v.priceAud.toFixed(2).padStart(8)} AUD → ` +
        `${audSangVnd(v.priceAud).toLocaleString("vi-VN").padStart(12)}đ  ${sp.title.slice(0, 45)}`
    )
  }
  logger.info("└─ VND zero-decimal: dùng trực tiếp số đồng, tuyệt đối không chia 100.")
  logger.info("")
}

// ─────────────────────────────────────────────────────────────────────────────
// Chạy chính
// ─────────────────────────────────────────────────────────────────────────────

export default async function seedCwWines({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const soLuongRaw = process.env.SO_LUONG
  const soLuong = soLuongRaw ? Number(soLuongRaw) : undefined
  const coLo = Number(process.env.LO ?? 30)
  const chiXem = process.env.CHI_XEM === "1"

  logger.info("═".repeat(70))
  logger.info(
    ` SEED C.W. WINES${soLuong ? ` (giới hạn ${soLuong})` : " (toàn bộ)"}${chiXem ? " — CHỈ XEM" : ""}`
  )
  logger.info("═".repeat(70))

  // ── 1. Đọc nguồn ─────────────────────────────────────────────────────────
  logger.info("→ Đọc dữ liệu đã cào…")
  const tatCa = docJsonl(FILE_SAN_PHAM)
  const boSuuTap = doc<BoSuuTapCao[]>(FILE_DANH_MUC)
  const theme = doc<{ menu: MucMenu[] }>(FILE_THEME)
  logger.info(
    `  ✓ ${tatCa.length.toLocaleString("vi-VN")} sản phẩm · ` +
      `${boSuuTap.length} bộ sưu tập · menu ${theme.menu.length} mục`
  )

  // CHI_XEM phải thật sự không ghi CSDL: in trực tiếp từ nguồn trước mọi
  // workflow tạo region/kênh/kho/danh mục.
  if (chiXem) {
    const xem = tatCa
      .filter(sanPhamBanDuoc)
      .slice(0, soLuong || tatCa.length)
    inBangGia(xem, logger)
    logger.info(" CHI_XEM=1 — không tạo hoặc sửa bất kỳ bản ghi nào.")
    return
  }

  // ── 2. Nền cửa hàng ──────────────────────────────────────────────────────
  const { channel, shippingProfile, apiKey, region, stockLocation } = await dungNenCuaHang(container, logger)
  await dungVanChuyen(container, logger, stockLocation, region, shippingProfile)

  // ── 3. Cây danh mục ──────────────────────────────────────────────────────
  logger.info("→ Dựng cây danh mục…")
  const mapDanhMuc = await taoCayDanhMuc(container, boSuuTap, theme.menu, logger, chiXem)

  // ── 4. Khử trùng theo handle + SKU ───────────────────────────────────────
  //
  // ⚠️ query.graph CÓ PHÂN TRANG MẶC ĐỊNH. Gọi một lần rồi coi là "đã lấy hết"
  // chỉ đọc được trang đầu; lần chạy trước của script shop khác vì thế bỏ sót
  // phần lớn SKU đã có và 271 sản phẩm rớt với lỗi "sku already exists".
  const handleDaCo = new Set<string>()
  const skuDaCo = new Set<string>()
  const COTRANG = 1000
  for (let skip = 0; ; skip += COTRANG) {
    const { data: trang } = await query.graph({
      entity: "product",
      fields: ["handle", "variants.sku"],
      filters: {},
      pagination: { skip, take: COTRANG },
    })
    if (!trang || trang.length === 0) break
    for (const p of trang) {
      if (p?.handle) handleDaCo.add(p.handle)
      for (const v of p.variants ?? []) if (v?.sku) skuDaCo.add(v.sku)
    }
    if (trang.length < COTRANG) break
  }
  logger.info(
    `  ✓ CSDL đang có ${handleDaCo.size.toLocaleString("vi-VN")} sản phẩm · ` +
      `${skuDaCo.size.toLocaleString("vi-VN")} SKU`
  )

  let boQuaHandle = 0
  let boQuaKhongGia = 0
  let doiSku = 0
  let khongDanhMuc = 0
  const canTao: { sp: SanPhamCao; danhMuc: string[] }[] = []

  for (const sp of tatCa) {
    if (!sp.handle) continue
    if (handleDaCo.has(sp.handle)) {
      boQuaHandle++
      continue
    }
    if (!sanPhamBanDuoc(sp)) {
      boQuaKhongGia++
      continue
    }

    // TRÙNG SKU THÌ ĐỔI SỐ HIỆU, ĐỪNG VỨT SẢN PHẨM. Hậu tố suy ra từ handle
    // nên ổn định: chạy lại cho ra đúng SKU cũ, không tạo bản sao.
    for (const v of sp.variants) {
      if (skuDaCo.has(v.sku)) {
        v.sku = `${v.sku}-${sp.handle.slice(0, 30)}`
        doiSku++
      }
      skuDaCo.add(v.sku)
    }

    const danhMuc = sp.collections
      .map((h) => mapDanhMuc.get(h))
      .filter((x): x is string => Boolean(x))
    if (danhMuc.length === 0) khongDanhMuc++

    handleDaCo.add(sp.handle)
    canTao.push({ sp, danhMuc })
    if (soLuong && canTao.length >= soLuong) break
  }

  logger.info(
    `  ✓ ${canTao.length.toLocaleString("vi-VN")} cần tạo · ` +
      `${boQuaHandle.toLocaleString("vi-VN")} trùng handle · ` +
      `${boQuaKhongGia} không có giá · ` +
      `${doiSku} SKU được đổi số hiệu`
  )
  if (khongDanhMuc > 0) logger.warn(`  ⚠ ${khongDanhMuc} sản phẩm không gắn được danh mục nào`)

  if (canTao.length === 0) {
    logger.info(" Không có gì để nạp.")
    return
  }

  // ── 5. Bảng đối chiếu tiền tệ (ADR-010) ──────────────────────────────────
  inBangGia(canTao.map((x) => x.sp), logger)

  // ── 6. Nạp theo lô ───────────────────────────────────────────────────────
  const payload = canTao.map(({ sp, danhMuc }) =>
    dungPayload(sp, danhMuc, channel.id, shippingProfile.id)
  )

  let daTao = 0
  let loi = 0
  const batDau = Date.now()
  for (let i = 0; i < payload.length; i += coLo) {
    const lo = payload.slice(i, i + coLo)
    try {
      await createProductsWorkflow(container).run({ input: { products: lo } })
      daTao += lo.length
    } catch (e: any) {
      // Lô hỏng → thử lại TỪNG SẢN PHẨM một.
      //
      // createProductsWorkflow chạy cả lô trong một transaction: một sản phẩm
      // lỗi là mất trắng 29 sản phẩm tốt còn lại. Lần chạy đầu của shop khác
      // mất 2.626/4.066 sản phẩm đúng vì lý do này.
      logger.warn(`  ⚠ Lô ${i}–${i + lo.length} hỏng, thử lại từng sản phẩm…`)
      for (const sp of lo) {
        try {
          await createProductsWorkflow(container).run({ input: { products: [sp] } })
          daTao++
        } catch (e2: any) {
          loi++
          if (loi <= 20) {
            logger.error(
              `    ✖ ${(sp as any).handle}: ${String(e2?.message ?? e2).slice(0, 160)}`
            )
          } else if (loi === 21) {
            logger.error("    … (thôi in chi tiết, sẽ tổng kết ở cuối)")
          }
        }
      }
    }
    if ((i / coLo) % 10 === 0 || i + coLo >= payload.length) {
      const giay = (Date.now() - batDau) / 1000
      const tocDo = daTao / Math.max(giay, 1)
      const conLai = Math.round((payload.length - daTao) / Math.max(tocDo, 0.1))
      logger.info(
        `  … ${daTao.toLocaleString("vi-VN")}/${payload.length.toLocaleString("vi-VN")} ` +
          `· ${tocDo.toFixed(1)} sp/s · còn ~${Math.floor(conLai / 60)} phút`
      )
    }
  }

  // category_ids/categories ở create không đáng tin trong Medusa v2: gắn bằng
  // update riêng, đọc lại xác nhận, rồi mới tạo tồn kho thật.
  await ganDanhMucVaXacNhan(container, canTao, logger)
  await taoTonKho(container, canTao, stockLocation, logger)

  logger.info("")
  logger.info("═".repeat(70))
  logger.info(` ĐÃ NẠP ${daTao.toLocaleString("vi-VN")} SẢN PHẨM · ${mapDanhMuc.size} DANH MỤC`)
  if (loi > 0) logger.warn(` ✖ ${loi.toLocaleString("vi-VN")} sản phẩm KHÔNG nạp được (xem log trên)`)
  logger.info(` Publishable key: ${(apiKey as any).token ?? "(xem Admin → Developer)"}`)
  logger.info("═".repeat(70))
  logger.info(" BƯỚC TIẾP THEO — bắt buộc:")
  logger.info("   1. Đọc lại giá qua Store API, đối chiếu bảng ở trên")
  logger.info("   2. Kiểm tra shipping option 50.000đ ở checkout")
  logger.info("   3. npx medusa exec ./src/scripts/sync-meili.ts")
}
