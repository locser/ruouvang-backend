/**
 * ═══════════════════════════════════════════════════════════════════════
 *  NẠP DỮ LIỆU THẬT CHO 3 STOREFRONT: COOLMATE · HASAKI · YODY
 *
 *  Nguồn: các file JSONL do `scripts/scrapers/crawl-real-catalogs.js` cào
 *  từ chính coolmate.me / hasaki.vn / yody.vn — tên có dấu, ảnh CDN thật,
 *  giá thật, và cây danh mục thật của từng site.
 *
 *  Chạy:
 *    docker exec medusa-backend sh -c "cd /app/apps/backend && \
 *      npx medusa exec ./src/scripts/seed-real-catalogs.ts -- --shop all"
 *
 *  Tham số:
 *    --shop       coolmate | hasaki | yody | all   (mặc định all)
 *    --so-luong   giới hạn số sản phẩm mỗi shop (0 = nạp hết)
 *    --lo         số sản phẩm mỗi lô workflow (mặc định 30)
 *    --don-rac    xoá sản phẩm rác (ảnh placeholder) + danh mục cũ trước khi nạp
 *    --lam-lai    đi kèm --don-rac: xoá luôn sản phẩm do lần seed trước của
 *                 chính script này tạo, để nạp lại từ đầu. Cần dùng khi cây
 *                 danh mục được dựng lại, nếu không sản phẩm cũ sẽ không thuộc
 *                 danh mục nào (bước nạp bỏ qua handle đã tồn tại).
 *    --chi-xem    không tạo danh mục/sản phẩm, chỉ in ra dự định + bảng giá.
 *                 (Hạ tầng — kênh bán, khoá publishable, shipping profile —
 *                 VẪN được tạo vì cần có để dựng payload; các bước này
 *                 idempotent nên chạy lại không sinh thêm bản ghi.)
 *
 *  ⚠️ TIỀN TỆ (ADR-010): VND là zero-decimal — 199000 nghĩa là 199.000đ.
 *  Script in bảng đối chiếu giá trước khi nạp. Luôn chạy `--so-luong 10`
 *  và soi bảng đó trước khi nạp toàn bộ.
 *
 *  Idempotent theo `handle`: chạy lại sẽ bỏ qua sản phẩm/danh mục đã có.
 * ═══════════════════════════════════════════════════════════════════════
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

// ─────────────────────────────────────────────────────────────────────────
// Kiểu dữ liệu của file JSONL do crawler sinh ra
// ─────────────────────────────────────────────────────────────────────────

interface DanhMucCao {
  slug: string
  name: string
  id?: string
}

interface BienTheCao {
  sku: string
  title?: string
  color?: string | null
  size?: string | null
  price?: number | null
  originalPrice?: number | null
  inStock?: boolean
}

interface SanPhamCao {
  site: "coolmate" | "hasaki" | "yody"
  url: string
  handle: string
  title: string
  description?: string
  brand?: string | null
  sku?: string | null
  price: number
  originalPrice?: number | null
  images: string[]
  colors?: { name: string; hex: string | null }[]
  sizes?: string[]
  variants?: BienTheCao[]
  /** Chỉ Hasaki có: đường dẫn danh mục nhiều cấp, gốc → lá. */
  categoryPath?: DanhMucCao[]
  category?: DanhMucCao | null
  rating?: number | null
  reviewCount?: number | null
}

// ─────────────────────────────────────────────────────────────────────────
// Cấu hình từng shop
// ─────────────────────────────────────────────────────────────────────────

const CAU_HINH_SHOP = {
  coolmate: {
    ten: "Coolmate",
    kenhBan: "Coolmate D2C",
    khoaTitle: "Coolmate Storefront",
    file: "coolmate-products.jsonl",
    phuDe: "Coolmate — Đổi trả 60 ngày miễn phí",
  },
  hasaki: {
    ten: "Hasaki",
    kenhBan: "Hasaki Beauty",
    khoaTitle: "Hasaki Storefront",
    file: "hasaki-products.jsonl",
    phuDe: "Hasaki — Chính hãng 100%, giao NowFree 2H",
  },
  yody: {
    ten: "Yody",
    kenhBan: "Yody Omnichannel",
    khoaTitle: "Yody Storefront",
    file: "yody-products.jsonl",
    phuDe: "Yody — Hệ thống 250+ cửa hàng toàn quốc",
  },
} as const

type MaShop = keyof typeof CAU_HINH_SHOP

/** Ảnh placeholder mà crawler cũ nhét cho toàn bộ sản phẩm — dấu hiệu dữ liệu rác. */
const ANH_RAC = [
  "photo-1618354691373", // mọi sản phẩm Yody của bản cào cũ
  "photo-1598440947619", // mọi sản phẩm Hasaki của bản cào cũ
]

/** Thư mục chứa JSONL — nằm trong repo backend, cwd là gốc backend (local) hoặc /app (container). */
const THU_MUC_DATA = path.resolve(process.cwd(), "scripts/scrapers/data")

/**
 * Dấu đóng vào metadata của mọi danh mục do script này tạo.
 *
 * Cần thiết vì handle KHÔNG phân biệt được: bộ danh mục cũ cũng dùng tiền tố
 * "coolmate-/hasaki-/yody-". Có dấu này thì `--don-rac` biết chính xác cái nào
 * là danh mục thật dựng từ dữ liệu cào, cái nào là rác của lần seed trước.
 */
const NGUON_DANH_MUC = "crawl-real"

// ─────────────────────────────────────────────────────────────────────────
// Tiện ích
// ─────────────────────────────────────────────────────────────────────────

/**
 * Đọc tham số: BIẾN MÔI TRƯỜNG trước, rồi mới tới cờ dòng lệnh.
 *
 * `medusa exec script -- --co gia-tri` không truyền args qua nguyên vẹn ở
 * 2.17.2 (xem ghi chú tương tự trong import-shop.ts), nên biến môi trường là
 * đường chắc ăn:
 *   docker exec -e SHOP=coolmate -e SO_LUONG=10 medusa-backend \
 *     sh -c "cd /app/apps/backend && npx medusa exec ./src/scripts/seed-real-catalogs.ts"
 */
function docThamSo(argv: string[]) {
  const layCo = (ten: string) => {
    const i = argv.indexOf(`--${ten}`)
    if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1]
    const gan = argv.find((a) => a.startsWith(`--${ten}=`))
    return gan ? gan.split("=").slice(1).join("=") : undefined
  }
  const laBat = (v: string | undefined) =>
    v === "1" || v === "true" || v === "co" || v === "yes"

  return {
    shop: process.env.SHOP ?? layCo("shop") ?? "all",
    soLuong: Number(process.env.SO_LUONG ?? layCo("so-luong") ?? 0),
    coLo: Number(process.env.LO ?? layCo("lo") ?? 30),
    donRac: laBat(process.env.DON_RAC) || argv.includes("--don-rac"),
    chiXem: laBat(process.env.CHI_XEM) || argv.includes("--chi-xem"),
    lamLai: laBat(process.env.LAM_LAI) || argv.includes("--lam-lai"),
  }
}

/** Đọc file JSONL, bỏ dòng hỏng, khử trùng handle (giữ bản ghi cuối). */
function docJsonl(duongDan: string): SanPhamCao[] {
  if (!fs.existsSync(duongDan)) return []
  const theoHandle = new Map<string, SanPhamCao>()
  let dongHong = 0
  for (const dong of fs.readFileSync(duongDan, "utf8").split("\n")) {
    const s = dong.trim()
    if (!s) continue
    try {
      const o = JSON.parse(s) as SanPhamCao
      if (!o || !o.handle || !o.title || !(o.price > 0)) continue
      // Handle lấy từ URL nguồn có thể còn gạch ngang thừa ở đầu/cuối hoặc lặp
      // ("...mai-xuoc-", "...relax--charge"). Medusa từ chối những handle này
      // ("Invalid product handle ... must contain URL safe characters") nên
      // chuẩn hoá ngay từ lúc đọc, để mọi bước sau dùng cùng một giá trị.
      o.handle = lamSlug(o.handle)
      if (!o.handle) continue
      theoHandle.set(o.handle, o)
    } catch (e) {
      dongHong++
    }
  }
  if (dongHong > 0) {
    console.warn(`  ⚠ ${duongDan}: bỏ qua ${dongHong} dòng hỏng`)
  }
  return Array.from(theoHandle.values())
}

/**
 * Chuẩn hoá slug về dạng an toàn cho handle của Medusa.
 *
 * ⚠️ Thứ tự quan trọng: CẮT NGẮN TRƯỚC rồi mới bỏ gạch ngang ở hai đầu. Làm
 * ngược lại thì nhát cắt ở ký tự thứ 100 có thể rơi đúng vào một gạch ngang,
 * sinh ra handle kết thúc bằng "-" — Medusa từ chối handle đó.
 */
function lamSlug(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 100)
    .replace(/^-+|-+$/g, "")
}

/** Handle danh mục có tiền tố shop để 3 site không giẫm chân nhau. */
function handleDanhMuc(shop: MaShop, slug: string): string {
  return `${shop}-${lamSlug(slug)}`
}

/**
 * Đường dẫn danh mục của một sản phẩm, luôn trả mảng gốc → lá.
 * Hasaki có `categoryPath` nhiều cấp; Coolmate/Yody chỉ có một cấp.
 */
function duongDanDanhMuc(sp: SanPhamCao): DanhMucCao[] {
  if (Array.isArray(sp.categoryPath) && sp.categoryPath.length > 0) {
    return sp.categoryPath.filter((c) => c && c.slug)
  }
  if (sp.category && sp.category.slug) return [sp.category]
  return []
}

// ─────────────────────────────────────────────────────────────────────────
// Hạ tầng: shipping profile, kênh bán và khoá publishable cho từng shop
// ─────────────────────────────────────────────────────────────────────────

async function chuanBiHaTang(container: any, shop: MaShop, logger: any) {
  const cauHinh = CAU_HINH_SHOP[shop]
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
  const apiKeyModule = container.resolve(Modules.API_KEY)
  const fulfillmentModule = container.resolve(Modules.FULFILLMENT)

  // 1. Shipping profile — createProductsWorkflow BẮT BUỘC có, thiếu là lỗi cả lô.
  let [shippingProfile] = await fulfillmentModule.listShippingProfiles({
    type: "default",
  })
  if (!shippingProfile) {
    const { result } = await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: "Mặc định", type: "default" }] },
    })
    shippingProfile = result[0]
    logger.info(`  + Tạo shipping profile mặc định`)
  }

  // 2. Kênh bán riêng cho shop — đây là thứ tách dữ liệu giữa 3 site.
  let [kenh] = await salesChannelModule.listSalesChannels({
    name: cauHinh.kenhBan,
  })
  if (!kenh) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: {
        salesChannelsData: [
          {
            name: cauHinh.kenhBan,
            description: `Kênh bán riêng của storefront ${cauHinh.ten}`,
          },
        ],
      },
    })
    kenh = result[0]
    logger.info(`  + Tạo kênh bán "${cauHinh.kenhBan}"`)
  }

  // 3. Cửa hàng: đặt tiền tệ VND và kênh bán mặc định.
  //    Thiếu bước này thì giá tạo ra không thuộc tiền tệ nào cửa hàng nhận.
  const storeModule = container.resolve(Modules.STORE)
  const [cuaHang] = await storeModule.listStores()
  if (cuaHang) {
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: cuaHang.id },
        update: {
          supported_currencies: [{ currency_code: "vnd", is_default: true }],
          default_sales_channel_id: kenh.id,
        },
      },
    })
  }

  // 4. Region + tax region.
  //
  //    ⚠️ `provider_id: "tp_system"` là BẮT BUỘC. Bỏ trống thì
  //    `tax_region.provider_id` là NULL và Medusa ném lỗi ngay khi khách thêm
  //    món đầu tiên vào giỏ ("Unable to retrieve the tax provider with id:
  //    null"). Sản phẩm vẫn tìm được, giá vẫn đọc được, nhưng KHÔNG BÁN ĐƯỢC
  //    GÌ — và thông báo lỗi không hề nhắc tới thuế. Xem ghi chú cùng nội dung
  //    trong import-shop.ts, phát hiện 29/07/2026.
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
    await createTaxRegionsWorkflow(container).run({
      input: [{ country_code: "vn", provider_id: "tp_system" }],
    })
    logger.info(`  + Tạo region "Việt Nam" (vnd) + tax region`)
  }

  // 5. Kho hàng, gắn vào kênh bán của shop.
  const stockModule = container.resolve(Modules.STOCK_LOCATION)
  let [kho] = await stockModule.listStockLocations({ name: "Kho chính" })
  if (!kho) {
    const { result } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: "Kho chính",
            address: { city: "Hồ Chí Minh", country_code: "vn", address_1: "" },
          },
        ],
      },
    })
    kho = result[0]
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: { id: kho.id, add: [kenh.id] },
    })
    logger.info(`  + Tạo kho chính`)
  }

  // 6. Khoá publishable riêng, gắn đúng kênh của shop.
  const dsKhoa = await apiKeyModule.listApiKeys({ type: "publishable" })
  let khoa = dsKhoa.find((k: any) => k.title === cauHinh.khoaTitle)
  if (!khoa) {
    const { result } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [
          {
            title: cauHinh.khoaTitle,
            type: "publishable",
            created_by: "seed-real-catalogs",
          },
        ],
      },
    })
    khoa = result[0]
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: { id: khoa.id, add: [kenh.id] },
    })
    logger.info(`  + Tạo khoá publishable "${cauHinh.khoaTitle}"`)
  }

  return { kenh, khoa, shippingProfile, region }
}

// ─────────────────────────────────────────────────────────────────────────
// Dọn dữ liệu rác của lần seed trước
// ─────────────────────────────────────────────────────────────────────────

async function donRac(
  container: any,
  logger: any,
  chiXem: boolean,
  lamLai: boolean
) {
  const productModule = container.resolve(Modules.PRODUCT)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  logger.info("")
  logger.info("── DỌN DỮ LIỆU RÁC ─────────────────────────────────────────")

  // 1. Sản phẩm dùng ảnh placeholder — toàn bộ là hàng do crawler cũ bịa ra.
  const { data: tatCa } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "thumbnail"],
    pagination: { take: 100000, skip: 0 },
  })
  const rac = tatCa.filter(
    (p: any) => p.thumbnail && ANH_RAC.some((a) => p.thumbnail.includes(a))
  )
  logger.info(`  Sản phẩm rác (ảnh placeholder): ${rac.length}`)

  // Với `--lam-lai`: xoá luôn sản phẩm do chính script này nạp lần trước.
  //
  // Cần khi cây danh mục được dựng lại: xoá danh mục cũ làm đứt liên kết
  // product↔category, mà bước nạp lại bỏ qua sản phẩm đã có handle nên chúng
  // sẽ nằm chơ vơ không thuộc danh mục nào. Xoá đi để nạp lại cho sạch.
  let cuaScriptNay: any[] = []
  if (lamLai) {
    const { data: coMeta } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "metadata"],
      pagination: { take: 100000, skip: 0 },
    })
    const idRac = new Set(rac.map((p: any) => p.id))
    cuaScriptNay = coMeta.filter(
      (p: any) => (p.metadata as any)?.shop && !idRac.has(p.id)
    )
    logger.info(`  Sản phẩm của lần seed trước (--lam-lai): ${cuaScriptNay.length}`)
  }

  // 2. Danh mục cũ.
  //
  //    KHÔNG lọc theo tiền tố handle được: bộ danh mục cũ cũng đặt tên
  //    "coolmate-ao-thun", "hasaki-kem-chong-nang", "yody-ao-polo" — trùng
  //    đúng quy ước mà script này dùng, nên lọc theo tiền tố sẽ bỏ sót hết.
  //
  //    Dấu hiệu đáng tin duy nhất là metadata.nguon do chính script này ghi.
  //    Danh mục nào thiếu dấu đó đều là của lần seed trước → xoá, vì cây danh
  //    mục sẽ được dựng lại đầy đủ từ dữ liệu cào ngay sau đây.
  // ⚠️ `select` phải khai rõ `metadata`, nếu không trường này về `undefined`
  // với MỌI danh mục — bộ lọc bên dưới sẽ coi tất cả là rác và xoá sạch cây
  // danh mục thật ở mỗi lần chạy.
  const dsDanhMuc = await productModule.listProductCategories(
    {},
    { select: ["id", "handle", "metadata"], take: null }
  )
  const danhMucCu = dsDanhMuc.filter(
    (c: any) => (c.metadata as any)?.nguon !== NGUON_DANH_MUC
  )
  logger.info(
    `  Danh mục cũ cần xoá: ${danhMucCu.length}/${dsDanhMuc.length} ` +
      `(giữ lại ${dsDanhMuc.length - danhMucCu.length} danh mục do lần chạy trước của script này tạo)`
  )

  if (chiXem) {
    logger.info("  (chế độ --chi-xem: không xoá gì cả)")
    return
  }

  const canXoa = [...rac, ...cuaScriptNay]
  if (canXoa.length > 0) {
    // Xoá theo lô để tránh câu lệnh quá dài.
    for (let i = 0; i < canXoa.length; i += 200) {
      const lo = canXoa.slice(i, i + 200).map((p: any) => p.id)
      await productModule.deleteProducts(lo)
    }
    logger.info(`  ✓ Đã xoá ${canXoa.length} sản phẩm`)
  }
  if (danhMucCu.length > 0) {
    await productModule.deleteProductCategories(danhMucCu.map((c: any) => c.id))
    logger.info(`  ✓ Đã xoá ${danhMucCu.length} danh mục cũ`)
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Tạo cây danh mục thật
// ─────────────────────────────────────────────────────────────────────────

/**
 * Tạo (hoặc tìm lại) toàn bộ danh mục của một shop, giữ đúng quan hệ cha–con.
 * Trả về Map: handle danh mục → id trong Medusa.
 */
async function taoDanhMuc(
  container: any,
  shop: MaShop,
  danhSach: SanPhamCao[],
  logger: any,
  chiXem: boolean
): Promise<Map<string, string>> {
  const productModule = container.resolve(Modules.PRODUCT)

  // Gom mọi đường dẫn danh mục, tách theo từng cấp.
  // capDo[0] = danh mục gốc, capDo[1] = con của gốc, ...
  const capDo: Map<string, { name: string; handleCha: string | null }>[] = []
  for (const sp of danhSach) {
    const duongDan = duongDanDanhMuc(sp)
    for (let i = 0; i < duongDan.length; i++) {
      if (!capDo[i]) capDo[i] = new Map()
      const h = handleDanhMuc(shop, duongDan[i].slug)
      const handleCha = i > 0 ? handleDanhMuc(shop, duongDan[i - 1].slug) : null
      if (!capDo[i].has(h)) capDo[i].set(h, { name: duongDan[i].name, handleCha })
    }
  }

  const tongCap = capDo.reduce((s, m) => s + m.size, 0)
  logger.info(
    `  Danh mục cần có: ${tongCap} (sâu ${capDo.length} cấp: ${capDo
      .map((m) => m.size)
      .join(" → ")})`
  )
  if (chiXem) return new Map()

  // Danh mục đã tồn tại (chạy lại lần 2 thì dùng lại, không tạo trùng).
  //
  // ⚠️ PHẢI khai `select` rõ ràng. Không khai thì module vẫn trả đủ số bản ghi
  // nhưng `handle` là `undefined`, bảng tra rỗng, và lần chạy sau đi tạo lại
  // toàn bộ danh mục đã có → lỗi hàng loạt "already exists".
  const daCo = await productModule.listProductCategories(
    {},
    { select: ["id", "handle"], take: null }
  )
  const mapHandleId = new Map<string, string>()
  for (const c of daCo) {
    if (c.handle) mapHandleId.set(c.handle, c.id)
  }

  // Tạo lần lượt từng cấp để cấp con luôn có sẵn id của cha.
  for (let i = 0; i < capDo.length; i++) {
    const canTao: any[] = []
    for (const [h, info] of capDo[i]) {
      if (mapHandleId.has(h)) continue
      canTao.push({
        name: info.name,
        handle: h,
        is_active: true,
        parent_category_id: info.handleCha
          ? mapHandleId.get(info.handleCha) ?? null
          : null,
        // Dấu nguồn để `--don-rac` lần sau phân biệt được với danh mục cũ.
        metadata: { nguon: NGUON_DANH_MUC, shop },
      })
    }
    if (canTao.length === 0) continue

    // Tạo theo lô nhỏ: một danh mục lỗi không kéo cả cấp chết theo.
    for (let j = 0; j < canTao.length; j += 50) {
      const lo = canTao.slice(j, j + 50)
      try {
        const { result } = await createProductCategoriesWorkflow(container).run({
          input: { product_categories: lo },
        })
        for (const c of result) mapHandleId.set(c.handle, c.id)
      } catch (e: any) {
        logger.warn(
          `  ⚠ Lô danh mục cấp ${i + 1} hỏng, thử từng cái: ${String(
            e?.message ?? e
          ).slice(0, 120)}`
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
    logger.info(`  ✓ Cấp ${i + 1}: xong ${capDo[i].size} danh mục`)
  }

  return mapHandleId
}

// ─────────────────────────────────────────────────────────────────────────
// Dựng payload sản phẩm
// ─────────────────────────────────────────────────────────────────────────

const TEN_MAU = "Màu sắc"
const TEN_SIZE = "Kích thước"
const TEN_MAC_DINH = "Phân loại"
const GIA_TRI_MAC_DINH = "Mặc định"

/**
 * Chuyển một sản phẩm đã cào sang payload của createProductsWorkflow.
 *
 * Ràng buộc của Medusa v2 phải tôn trọng:
 *   - Sản phẩm phải có ít nhất 1 option, và MỌI biến thể phải khai đủ giá trị
 *     cho TẤT CẢ option đã khai — nên chỗ thiếu được điền "Mặc định".
 *   - Không được có hai biến thể trùng tổ hợp option.
 *   - SKU phải duy nhất trên toàn hệ thống.
 */
function dungPayloadSanPham(
  sp: SanPhamCao,
  shop: MaShop,
  idDanhMuc: string | null,
  idKenh: string,
  idShippingProfile: string,
  skuDaCo: Set<string>
) {
  const cauHinh = CAU_HINH_SHOP[shop]

  const bienTheGoc: BienTheCao[] =
    sp.variants && sp.variants.length > 0
      ? sp.variants
      : [{ sku: sp.sku || sp.handle, price: sp.price }]

  const coMau = bienTheGoc.some((v) => v.color)
  const coSize = bienTheGoc.some((v) => v.size)

  const tenOption: string[] = []
  if (coMau) tenOption.push(TEN_MAU)
  if (coSize) tenOption.push(TEN_SIZE)
  if (tenOption.length === 0) tenOption.push(TEN_MAC_DINH)

  const giaTriOption = new Map<string, Set<string>>()
  for (const t of tenOption) giaTriOption.set(t, new Set())

  const daThayToHop = new Set<string>()
  const bienThe: any[] = []

  for (const [i, v] of bienTheGoc.entries()) {
    const opt: Record<string, string> = {}
    if (coMau) opt[TEN_MAU] = (v.color || GIA_TRI_MAC_DINH).trim()
    if (coSize) opt[TEN_SIZE] = (v.size || GIA_TRI_MAC_DINH).trim()
    if (tenOption.length === 1 && tenOption[0] === TEN_MAC_DINH) {
      opt[TEN_MAC_DINH] = GIA_TRI_MAC_DINH
    }

    // Bỏ biến thể trùng tổ hợp option — Medusa từ chối cả sản phẩm nếu có.
    const khoaToHop = tenOption.map((t) => opt[t]).join("|")
    if (daThayToHop.has(khoaToHop)) continue
    daThayToHop.add(khoaToHop)

    for (const t of tenOption) giaTriOption.get(t)!.add(opt[t])

    // SKU duy nhất toàn hệ thống. Trùng hoặc rỗng thì suy ra từ handle.
    let sku = (v.sku || "").trim()
    if (!sku || skuDaCo.has(sku)) sku = `${shop.toUpperCase()}-${sp.handle}-${i + 1}`.slice(0, 90)
    if (skuDaCo.has(sku)) continue
    skuDaCo.add(sku)

    const gia = v.price && v.price > 0 ? v.price : sp.price

    bienThe.push({
      title: (v.title || `${sp.title} — ${tenOption.map((t) => opt[t]).join(" / ")}`).slice(0, 250),
      sku,
      manage_inventory: false,
      options: opt,
      prices: [{ amount: gia, currency_code: "vnd" }],
    })
  }

  if (bienThe.length === 0) return null

  const anh = (sp.images || []).filter((u) => u && u.startsWith("http")).slice(0, 8)

  return {
    title: sp.title.slice(0, 250),
    handle: sp.handle,
    subtitle: cauHinh.phuDe,
    description: sp.description || `${sp.title} — hàng chính hãng ${cauHinh.ten}.`,
    status: ProductStatus.PUBLISHED,
    shipping_profile_id: idShippingProfile,
    thumbnail: anh[0] || null,
    images: anh.map((url) => ({ url })),
    options: tenOption.map((t) => ({
      title: t,
      values: Array.from(giaTriOption.get(t)!),
    })),
    variants: bienThe,
    categories: idDanhMuc ? [{ id: idDanhMuc }] : [],
    sales_channels: [{ id: idKenh }],
    metadata: {
      nguon: sp.url,
      shop,
      thuong_hieu: sp.brand ?? null,
      gia_goc: sp.originalPrice ?? null,
      danh_gia: sp.rating ?? null,
      so_danh_gia: sp.reviewCount ?? null,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Vá liên kết danh mục cho sản phẩm đã tồn tại
// ─────────────────────────────────────────────────────────────────────────

/**
 * Gắn danh mục cho những sản phẩm của shop đang không thuộc danh mục nào.
 *
 * Chạy được nhiều lần: sản phẩm đã có danh mục thì bỏ qua.
 */
async function vaDanhMucChoSanPhamCu(
  container: any,
  shop: MaShop,
  danhSach: SanPhamCao[],
  mapDanhMuc: Map<string, string>,
  logger: any
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: dsSanPham } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "metadata", "categories.id"],
    filters: { metadata: { shop } },
    pagination: { take: 100000, skip: 0 },
  })

  const thieuDanhMuc = dsSanPham.filter(
    (p: any) => !p.categories || p.categories.length === 0
  )
  if (thieuDanhMuc.length === 0) return

  // Tra ngược handle sản phẩm → id danh mục lá, từ chính dữ liệu đã cào.
  const theoHandle = new Map(danhSach.map((s) => [s.handle, s]))

  const canVa: { id: string; categories: { id: string }[] }[] = []
  for (const p of thieuDanhMuc) {
    const sp = theoHandle.get(p.handle)
    if (!sp) continue
    const duongDan = duongDanDanhMuc(sp)
    if (duongDan.length === 0) continue
    const idDanhMuc = mapDanhMuc.get(
      handleDanhMuc(shop, duongDan[duongDan.length - 1].slug)
    )
    if (!idDanhMuc) continue
    canVa.push({ id: p.id, categories: [{ id: idDanhMuc }] })
  }

  if (canVa.length === 0) {
    logger.warn(
      `  ⚠ ${thieuDanhMuc.length} sản phẩm thiếu danh mục nhưng không tra được danh mục tương ứng`
    )
    return
  }

  logger.info(`  Vá danh mục cho ${canVa.length} sản phẩm đã có sẵn…`)
  let daVa = 0
  for (let i = 0; i < canVa.length; i += 30) {
    const lo = canVa.slice(i, i + 30)
    try {
      await updateProductsWorkflow(container).run({
        input: { products: lo as any },
      })
      daVa += lo.length
    } catch (e: any) {
      for (const sp of lo) {
        try {
          await updateProductsWorkflow(container).run({
            input: { products: [sp] as any },
          })
          daVa++
        } catch (e2: any) {
          logger.error(
            `    ✖ vá ${sp.id}: ${String(e2?.message ?? e2).slice(0, 120)}`
          )
        }
      }
    }
  }
  logger.info(`  ✓ Đã vá danh mục cho ${daVa} sản phẩm`)
}

// ─────────────────────────────────────────────────────────────────────────
// Nạp sản phẩm của một shop
// ─────────────────────────────────────────────────────────────────────────

async function napShop(
  container: any,
  shop: MaShop,
  thamSo: ReturnType<typeof docThamSo>,
  logger: any
) {
  const cauHinh = CAU_HINH_SHOP[shop]
  logger.info("")
  logger.info(`═══ ${cauHinh.ten.toUpperCase()} ══════════════════════════════`)

  const duongDanFile = path.join(THU_MUC_DATA, cauHinh.file)
  let danhSach = docJsonl(duongDanFile)
  if (danhSach.length === 0) {
    logger.warn(`  Không có dữ liệu tại ${duongDanFile} — bỏ qua shop này.`)
    logger.warn(`  Chạy: node scripts/scrapers/crawl-real-catalogs.js --site=${shop}`)
    return
  }
  logger.info(`  Đọc được ${danhSach.length} sản phẩm thật từ ${cauHinh.file}`)

  if (thamSo.soLuong > 0 && danhSach.length > thamSo.soLuong) {
    logger.info(
      `  GIỚI HẠN: chỉ nạp ${thamSo.soLuong}/${danhSach.length} sản phẩm (do --so-luong).`
    )
    danhSach = danhSach.slice(0, thamSo.soLuong)
  }

  const { kenh, khoa, shippingProfile } = await chuanBiHaTang(container, shop, logger)
  logger.info(`  Kênh bán: ${kenh.name} (${kenh.id})`)
  logger.info(`  Khoá publishable: ${khoa.token}`)

  const mapDanhMuc = await taoDanhMuc(container, shop, danhSach, logger, thamSo.chiXem)

  // Bỏ sản phẩm đã có trong CSDL (idempotent theo handle).
  const productModule = container.resolve(Modules.PRODUCT)
  const daCoSanPham = await productModule.listProducts(
    { handle: danhSach.map((s) => s.handle) },
    { select: ["handle"], take: null }
  )
  const handleDaCo = new Set(daCoSanPham.map((p: any) => p.handle))
  const canTao = danhSach.filter((s) => !handleDaCo.has(s.handle))
  logger.info(
    `  Đã có sẵn ${handleDaCo.size} · cần tạo mới ${canTao.length}`
  )

  // Vá liên kết danh mục cho sản phẩm ĐÃ TỒN TẠI mà đang không thuộc danh mục nào.
  //
  // Xảy ra khi một lần chạy trước tạo sản phẩm lúc bảng tra danh mục còn rỗng
  // (ví dụ lỗi thiếu `select` khiến handle danh mục về undefined). Bước tạo mới
  // bỏ qua handle đã có, nên nếu không vá ở đây thì các sản phẩm đó vĩnh viễn
  // không xuất hiện trong bất kỳ trang danh mục nào.
  if (!thamSo.chiXem && handleDaCo.size > 0 && mapDanhMuc.size > 0) {
    await vaDanhMucChoSanPhamCu(container, shop, danhSach, mapDanhMuc, logger)
  }

  if (canTao.length === 0) {
    logger.info("  Không có gì để nạp.")
    return
  }

  // SKU đã dùng trên toàn hệ thống, để không tạo trùng.
  const skuDaCo = new Set<string>()
  const bienTheDaCo = await productModule.listProductVariants(
    {},
    { select: ["sku"], take: null }
  )
  for (const v of bienTheDaCo) {
    if (v.sku) skuDaCo.add(v.sku)
  }

  const payload: any[] = []
  let boQuaThieuDanhMuc = 0
  for (const sp of canTao) {
    const duongDan = duongDanDanhMuc(sp)
    const handleLa = duongDan.length
      ? handleDanhMuc(shop, duongDan[duongDan.length - 1].slug)
      : null
    const idDanhMuc = handleLa ? mapDanhMuc.get(handleLa) ?? null : null
    if (!idDanhMuc) boQuaThieuDanhMuc++

    const p = dungPayloadSanPham(
      sp,
      shop,
      idDanhMuc,
      kenh.id,
      shippingProfile.id,
      skuDaCo
    )
    if (p) payload.push(p)
  }
  if (boQuaThieuDanhMuc > 0 && !thamSo.chiXem) {
    logger.warn(`  ⚠ ${boQuaThieuDanhMuc} sản phẩm không gắn được danh mục`)
  }

  // ═══ BẢNG ĐỐI CHIẾU TIỀN TỆ (ADR-010) ═══
  // VND zero-decimal: sai ở đây là lệch 100 lần trên mọi đơn hàng.
  logger.info("")
  logger.info("  ┌─ ĐỐI CHIẾU GIÁ — so với giá trên website gốc")
  for (const p of payload.slice(0, 8)) {
    const gia = p.variants[0].prices[0].amount
    logger.info(
      `  │  ${String(gia).padStart(9)} đ  ${p.title.slice(0, 52)}`
    )
  }
  logger.info("  └─ Lệch 100 lần thì DỪNG, đừng nạp tiếp.")
  logger.info("")

  if (thamSo.chiXem) {
    logger.info(`  (chế độ --chi-xem: dừng ở đây, không ghi CSDL)`)
    return
  }

  let daTao = 0
  let loi = 0
  const batDau = Date.now()
  for (let i = 0; i < payload.length; i += thamSo.coLo) {
    const lo = payload.slice(i, i + thamSo.coLo)
    try {
      await createProductsWorkflow(container).run({ input: { products: lo } })
      daTao += lo.length
    } catch (e: any) {
      // Cả lô chạy trong một transaction: một sản phẩm hỏng là mất cả lô.
      // Thử lại từng cái để chỉ mất đúng cái hỏng.
      for (const sp of lo) {
        try {
          await createProductsWorkflow(container).run({ input: { products: [sp] } })
          daTao++
        } catch (e2: any) {
          loi++
          if (loi <= 15) {
            logger.error(
              `    ✖ ${sp.handle}: ${String(e2?.message ?? e2).slice(0, 150)}`
            )
          } else if (loi === 16) {
            logger.error("    … (thôi in chi tiết)")
          }
        }
      }
    }
    if ((i / thamSo.coLo) % 10 === 0 || i + thamSo.coLo >= payload.length) {
      const giay = Math.round((Date.now() - batDau) / 1000)
      logger.info(
        `  … ${daTao}/${payload.length} sản phẩm (${giay}s, lỗi ${loi})`
      )
    }
  }

  logger.info(
    `  ✓ ${cauHinh.ten}: tạo ${daTao} sản phẩm · lỗi ${loi} · ${mapDanhMuc.size} danh mục`
  )
}

// ─────────────────────────────────────────────────────────────────────────

export default async function seedRealCatalogs({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const thamSo = docThamSo(args ?? [])

  logger.info("╔══════════════════════════════════════════════════════════╗")
  logger.info("║  NẠP DỮ LIỆU THẬT: COOLMATE · HASAKI · YODY             ║")
  logger.info("╚══════════════════════════════════════════════════════════╝")
  logger.info(
    `Tham số: shop=${thamSo.shop} · so-luong=${thamSo.soLuong || "hết"} · ` +
      `lo=${thamSo.coLo} · don-rac=${thamSo.donRac} · chi-xem=${thamSo.chiXem}`
  )

  if (thamSo.donRac) {
    await donRac(container, logger, thamSo.chiXem, thamSo.lamLai)
  }

  const dsShop: MaShop[] =
    thamSo.shop === "all"
      ? (["coolmate", "hasaki", "yody"] as MaShop[])
      : ([thamSo.shop] as MaShop[])

  for (const shop of dsShop) {
    if (!CAU_HINH_SHOP[shop]) {
      logger.error(`Shop không hợp lệ: ${shop}`)
      continue
    }
    await napShop(container, shop, thamSo, logger)
  }

  logger.info("")
  logger.info("Hoàn tất.")
}
