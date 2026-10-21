/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  NẠP DỮ LIỆU THẬT CHO SHOP RED APRON (rượu vang & rượu mạnh)
 *
 *  Nguồn: `scripts/scrapers/crawl-redapron.js` cào từ chính redapron.vn
 *  (nền Haravan) — 3.554 sản phẩm, 212 bộ sưu tập, ảnh CDN thật, giá thật.
 *
 *  Chạy TRONG container của Red Apron (không phải shop khác):
 *    docker exec -e SO_LUONG=10 medusa-backend-redapron sh -c \
 *      "cd /app/apps/backend && npx medusa exec ./src/scripts/seed-redapron.ts"
 *
 *  Tham số (đọc từ BIẾN MÔI TRƯỜNG — `medusa exec -- --co` không truyền args
 *  qua nguyên vẹn ở 2.17.2):
 *    SO_LUONG   giới hạn số sản phẩm (bỏ trống = nạp hết)
 *    LO         số sản phẩm mỗi lô workflow (mặc định 30)
 *    CHI_XEM    "1" = chỉ in dự định + bảng giá, không tạo gì
 *
 *  ⚠️ TIỀN TỆ (ADR-010): VND là zero-decimal — 3440000 nghĩa là 3.440.000đ.
 *  Haravan đã trả giá theo đơn vị đồng, KHÔNG nhân/chia 100. Script in bảng
 *  đối chiếu trước khi nạp. LUÔN chạy SO_LUONG=10 và soi bảng đó trước.
 *
 *  Idempotent theo `handle`: chạy lại bỏ qua sản phẩm/danh mục đã có.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
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

// Dữ liệu cào nằm trong repo backend: scripts/scrapers/data.
const THU_MUC_DATA = path.resolve(process.cwd(), "scripts/scrapers/data")
const FILE_SAN_PHAM = "redapron-products.jsonl"
const FILE_DANH_MUC = "redapron-categories.json"
const FILE_THEME = "redapron-theme.json"

const TEN_SHOP = "Red Apron"
const TEN_KENH_BAN = "Red Apron Fine Wines"
const TEN_KHOA = "Red Apron Storefront"

/** Dấu để lần chạy sau phân biệt danh mục do script này tạo. */
const NGUON_DANH_MUC = "crawl-redapron"

// ─────────────────────────────────────────────────────────────────────────────
// Kiểu dữ liệu của file JSONL do crawler sinh ra
// ─────────────────────────────────────────────────────────────────────────────

interface BienTheCao {
  sku: string
  title: string
  price: number
  originalPrice: number | null
  inventoryQuantity: number
  available: boolean
  weightGram: number
  barcode: string | null
}

interface SanPhamCao {
  site: "redapron"
  url: string
  handle: string
  title: string
  description: string
  brand: string | null
  productType: string | null
  price: number
  originalPrice: number | null
  available: boolean
  images: string[]
  variants: BienTheCao[]
  tags: string[]
  /** Thuộc tính bóc từ tag Haravan: country, grape, capacity, abv, region… */
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

/** Một mục trong cây menu của redapron-theme.json. */
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
        `  node "AI ECommerce Brain/scripts/scrapers/crawl-redapron.js"`
    )
  }
  return JSON.parse(fs.readFileSync(p, "utf-8")) as T
}

function docJsonl(ten: string): SanPhamCao[] {
  const p = path.join(THU_MUC_DATA, ten)
  if (!fs.existsSync(p)) {
    throw new Error(
      `Không có ${p}.\nChạy trước trên máy host:\n` +
        `  node "AI ECommerce Brain/scripts/scrapers/crawl-redapron.js"`
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
            // Trụ sở Red Apron — 91 Xuân Diệu, Tây Hồ, Hà Nội.
            address: { city: "Hà Nội", country_code: "vn", address_1: "91 Xuân Diệu, Tây Hồ" },
          },
        ],
      },
    })
    stockLocation = result[0]
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: { id: stockLocation.id, add: [channel.id] },
    })
  }

  const apiKeyModule = container.resolve(Modules.API_KEY)
  let [apiKey] = await apiKeyModule.listApiKeys({ type: "publishable" })
  if (!apiKey) {
    const { result } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [{ title: TEN_KHOA, type: "publishable", created_by: "seed-redapron" }],
      },
    })
    apiKey = result[0]
  }

  // ⚠️ NỐI KHOÁ VỚI KÊNH BÁN Ở NGOÀI NHÁNH `if (!apiKey)`.
  //
  // Backend Medusa tự dựng sẵn "Default Sales Channel" + một publishable key
  // nối vào đó ngay lần khởi động đầu. Script tạo kênh riêng "Red Apron Fine
  // Wines" và gắn sản phẩm vào kênh đó, nhưng `listApiKeys` lại tìm thấy khoá
  // mặc định nên nhánh tạo-mới không chạy, và khoá không bao giờ được nối với
  // kênh mới. Kết quả: `/store/products` trả về **0 sản phẩm, HTTP 200, không
  // một lời cảnh báo** dù CSDL có đủ hàng — đúng kiểu lỗi câm đã mất hai ngày
  // ở shop khác. Nối lại mỗi lần chạy; workflow này idempotent.
  // ⚠️ VÀ PHẢI GỠ CÁC KÊNH KHÁC RA, không chỉ thêm kênh của mình.
  //
  // Medusa dựng sẵn "Default Sales Channel" và nối khoá mặc định vào đó. Nếu
  // chỉ `add` kênh Red Apron thì khoá mang HAI kênh, và `POST /store/carts`
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
  return { channel, shippingProfile, apiKey }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cây danh mục
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dựng cây danh mục.
 *
 * Haravan KHÔNG có cây: 212 bộ sưu tập đều phẳng ngang nhau. Cấu trúc cha–con
 * chỉ tồn tại trong **mega menu** của theme, nên cây được suy ra từ
 * `redapron-theme.json`:
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
 * Menu chỉ phủ ~90 bộ; số còn lại (thương hiệu riêng như `chateau-lafleur`,
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
    if (cha.has(handle)) return // đã có cha rồi — giữ nguyên
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
        metadata: { nguon: NGUON_DANH_MUC, shop: "redapron", cap: cap + 1 },
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

const TEN_TUY_CHON = "Quy cách"
const GIA_TRI_MAC_DINH = "Mặc định"

/** Lấy giá trị đầu của một thuộc tính bóc từ tag, hoặc null. */
function tt(sp: SanPhamCao, khoa: string): string | null {
  const v = sp.thuocTinh?.[khoa]
  return Array.isArray(v) && v.length > 0 ? v[0] : null
}

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
  // Quy cách lấy từ tag `Capacity_750ml`; thiếu thì dùng nhãn mặc định.
  const quyCach = tt(sp, "capacity") ?? GIA_TRI_MAC_DINH
  const giaTriTuyChon = Array.from(
    new Set(sp.variants.map((v) => (sp.variants.length > 1 ? v.title : quyCach)))
  )

  const bienThe = sp.variants
    .filter((v) => v.price > 0)
    .map((v) => ({
      title: `${sp.title} — ${sp.variants.length > 1 ? v.title : quyCach}`.slice(0, 250),
      sku: v.sku,
      // manage_inventory = false nghĩa là "luôn bán được, không theo dõi số
      // lượng" — KHÔNG phải hết hàng. Các tầng dưới (meili-sync, products-lookup,
      // catalog service, tool handlers) đã được sửa để hiểu cờ này; xem sự cố
      // 04/08/2026 khi chatbot Hasaki báo "chưa có sản phẩm nào" với 7.869 SP.
      manage_inventory: false,
      allow_backorder: false,
      weight: v.weightGram || undefined,
      barcode: v.barcode ?? undefined,
      options: { [TEN_TUY_CHON]: sp.variants.length > 1 ? v.title : quyCach },
      prices: [{ amount: v.price, currency_code: "vnd" }],
    }))

  return {
    title: sp.title,
    handle: sp.handle,
    description: sp.description,
    status: ProductStatus.PUBLISHED,
    shipping_profile_id: idShippingProfile,
    thumbnail: sp.images[0] || null,
    images: sp.images.slice(0, 8).map((url) => ({ url })),
    options: [{ title: TEN_TUY_CHON, values: giaTriTuyChon }],
    variants: bienThe,
    sales_channels: [{ id: idKenh }],
    // Một sản phẩm thuộc NHIỀU bộ sưu tập — trung bình 4–17 bộ ở Red Apron.
    // Gắn hết để bộ lọc trên storefront (quốc gia × giống nho × giá) ra đúng
    // kết quả như site gốc.
    categories: idDanhMuc.map((id) => ({ id })),
    // metadata.specs là thứ Meilisearch dùng để lọc cứng. Bản 1.0 của script
    // shop khác để `specs: {}` rỗng, khiến mọi bộ lọc trả về 0 kết quả.
    metadata: {
      specs: {
        store_type: "redapron",
        thuong_hieu: sp.brand,
        loai: sp.productType,
        xuat_xu: tt(sp, "country"),
        vung_trong: tt(sp, "region"),
        giong_nho: sp.thuocTinh?.grape ?? [],
        dung_tich: tt(sp, "capacity"),
        nong_do: tt(sp, "abv"),
        nhom_1: tt(sp, "br1"),
        nhom_2: tt(sp, "br2"),
        tags: sp.tags,
      },
      url_goc: sp.url,
      ton_kho_nguon: sp.variants[0]?.inventoryQuantity ?? 0,
      gia_goc: sp.originalPrice ?? null,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Chạy chính
// ─────────────────────────────────────────────────────────────────────────────

export default async function seedRedApron({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const soLuongRaw = process.env.SO_LUONG
  const soLuong = soLuongRaw ? Number(soLuongRaw) : undefined
  const coLo = Number(process.env.LO ?? 30)
  const chiXem = process.env.CHI_XEM === "1"

  logger.info("═".repeat(70))
  logger.info(
    ` SEED RED APRON${soLuong ? ` (giới hạn ${soLuong})` : " (toàn bộ)"}${chiXem ? " — CHỈ XEM" : ""}`
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

  // ── 2. Nền cửa hàng ──────────────────────────────────────────────────────
  const { channel, shippingProfile, apiKey } = await dungNenCuaHang(container, logger)

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
    if (!sp.variants.some((v) => v.price > 0)) {
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
  logger.info("")
  logger.info("┌─ ĐỐI CHIẾU TIỀN TỆ — so con số dưới đây với Store API sau khi nạp")
  for (const { sp } of canTao.slice(0, 10)) {
    const v = sp.variants[0]
    logger.info(
      `│  ${v.sku.padEnd(20)} ${v.price.toLocaleString("vi-VN").padStart(15)} đ   ${sp.title.slice(0, 42)}`
    )
  }
  logger.info("└─ Nếu Store API trả về con số khác, DỪNG LẠI, đừng nạp tiếp.")
  logger.info("")

  if (chiXem) {
    logger.info(" CHI_XEM=1 — dừng ở đây, không tạo sản phẩm.")
    return
  }

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

  logger.info("")
  logger.info("═".repeat(70))
  logger.info(` ĐÃ NẠP ${daTao.toLocaleString("vi-VN")} SẢN PHẨM · ${mapDanhMuc.size} DANH MỤC`)
  if (loi > 0) logger.warn(` ✖ ${loi.toLocaleString("vi-VN")} sản phẩm KHÔNG nạp được (xem log trên)`)
  logger.info(` Publishable key: ${(apiKey as any).token ?? "(xem Admin → Developer)"}`)
  logger.info("═".repeat(70))
  logger.info(" BƯỚC TIẾP THEO — bắt buộc:")
  logger.info("   1. Đọc lại giá qua Store API, đối chiếu bảng ở trên")
  logger.info("   2. npx medusa exec ./src/scripts/setup-vanchuyen.ts   ← bỏ là tắc cuối phễu")
  logger.info("   3. npx medusa exec ./src/scripts/sync-meili.ts")
}
