/**
 * ═══════════════════════════════════════════════════════════════════════
 *  IMPORT DỮ LIỆU SHOP THẬT VÀO MEDUSA
 *
 *  Chạy trong container của ĐÚNG shop cần nạp:
 *    docker compose exec backend-cellphones \
 *      npx medusa exec ./src/scripts/import-shop.ts -- --nguon cellphones --so-luong 10
 *
 *  Tham số:
 *    --nguon      cellphones | farmersmarket
 *    --so-luong   giới hạn số sản phẩm (bỏ trống = nạp hết)
 *    --lo         số sản phẩm mỗi lô workflow (mặc định 20)
 *
 *  ⚠️ QUY TRÌNH BẮT BUỘC THEO ADR-010 — TIỀN TỆ
 *  VND là zero-decimal: 35000 nghĩa là 35.000đ, KHÔNG phải 350đ. Đây là chỗ
 *  dễ sai lệch 100 lần. Vì vậy LUÔN chạy `--so-luong 10` trước, đọc lại giá
 *  qua Store API và ĐỐI CHIẾU BẰNG MẮT với giá gốc mà script in ra. Chỉ khi
 *  khớp mới được nạp toàn bộ.
 *
 *  Idempotent theo `handle`: chạy lại bỏ qua sản phẩm đã có, không tạo trùng.
 * ═══════════════════════════════════════════════════════════════════════
 */
import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
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
import * as fs from "fs"
import * as path from "path"

const GOC_DU_LIEU = "/data"

// ---------------------------------------------------------------------------
// Kiểu trung gian — mọi nguồn đều quy về đây trước khi dựng payload Medusa
// ---------------------------------------------------------------------------
interface SanPhamNguon {
  title: string
  handle: string
  description: string
  brand?: string
  loai?: string
  /** Ảnh: URL tuyệt đối hoặc đường dẫn dưới /data. */
  anh: string[]
  bienThe: Array<{
    sku: string
    tenTuyChon: string
    /** Giá VND, số nguyên. */
    gia: number
    tonKho: number
  }>
  /** Thuộc tính kỹ thuật đưa vào metadata để Meilisearch lọc cứng. */
  specs: Record<string, unknown>
}

function slug(s: string): string {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
}

/** Giá về số nguyên VND. Chuỗi "35000" và số 35000.0 đều ra 35000. */
function tienVND(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.]/g, ""))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n)
}

// ---------------------------------------------------------------------------
// Nguồn 1 — Farmers Market (export Haravan, KHÔNG phải định dạng Medusa dù
// tên file là products_medusa_ready.json)
// ---------------------------------------------------------------------------
function docFarmersMarket(gioiHan?: number): SanPhamNguon[] {
  const p = path.join(GOC_DU_LIEU, "FamerMarket/data/products_medusa_ready.json")
  const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as any[]
  const out: SanPhamNguon[] = []
  const boQuaViKhongCoGia: string[] = []

  for (const r of raw) {
    const handle = String(r.handle ?? slug(r.title ?? "")).slice(0, 120)

    const bienThe = (r.variants ?? [])
      .map((v: any, i: number) => ({
        // SKU THIẾU THÌ SINH RA, ĐỪNG VỨT SẢN PHẨM.
        //
        // Bản trước: `String(v.sku || v.barcode || "").trim()` rồi
        // `.filter(v => v.sku && ...)`. Nguồn Haravan để `sku: null` cho hàng
        // combo/set quà, nên chuỗi rỗng bị lọc, `bienThe` rỗng, và cả sản phẩm
        // bị `continue` bỏ qua — KHÔNG đếm, KHÔNG log. 58 sản phẩm biến mất
        // không để lại dấu vết nào, mà toàn combo, set quà, mâm trái cây: đúng
        // nhóm hàng đắt tiền nhất của shop thực phẩm.
        //
        // Sinh theo `handle` nên ổn định: chạy lại cho ra đúng SKU cũ, không
        // tạo bản sao. Hậu tố chỉ thêm khi sản phẩm có nhiều biến thể.
        sku:
          String(v.sku || v.barcode || "").trim() ||
          `AUTO-${handle.slice(0, 40)}${(r.variants ?? []).length > 1 ? `-${i + 1}` : ""}`,
        tenTuyChon: String(v.option1 || v.title || "Mặc định").trim() || "Mặc định",
        gia: tienVND(v.price),
        tonKho: Number(v.inventory_quantity ?? 0) || 0,
      }))
      // Chỉ còn giá là điều kiện bắt buộc — không có giá thì thật sự không bán
      // được. Đếm lại để không bao giờ mất hàng trong im lặng nữa.
      .filter((v: any) => v.gia > 0)

    if (bienThe.length === 0) {
      boQuaViKhongCoGia.push(handle)
      continue
    }

    // Bỏ mô tả HTML về text thuần: body_html chứa đầy thẻ <span style> vô nghĩa
    // với mô hình và làm phình prompt.
    const moTa = String(r.body_html ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000)

    out.push({
      title: String(r.title ?? "").trim(),
      handle: String(r.handle ?? slug(r.title ?? "")).slice(0, 120),
      description: moTa,
      brand: r.vendor ? String(r.vendor) : undefined,
      loai: r.product_type ? String(r.product_type) : undefined,
      anh: (r.images ?? []).map((i: any) => String(i.src)).filter(Boolean),
      bienThe,
      specs: {
        store_type: "farmersmarket",
        vendor: r.vendor ?? null,
        product_type: r.product_type ?? null,
        tags: typeof r.tags === "string" ? r.tags.split(",").map((t: string) => t.trim()) : [],
      },
    })
    if (gioiHan && out.length >= gioiHan) break
  }

  // Nói thẳng ra những gì đã bỏ. Khâu đọc file từng vứt 58 sản phẩm mà không
  // để lại một dòng log nào — chỉ phát hiện được khi đếm tay số sản phẩm trong
  // file nguồn rồi so với CSDL, hai tuần sau.
  console.log(
    `[ĐọcNguồn] Farmers Market: đọc ${raw.length} · lấy ${out.length} · ` +
    `bỏ ${boQuaViKhongCoGia.length} vì không có biến thể nào có giá`
  );
  if (boQuaViKhongCoGia.length > 0) {
    console.log(`[ĐọcNguồn]   ${boQuaViKhongCoGia.slice(0, 10).join(", ")}${boQuaViKhongCoGia.length > 10 ? " …" : ""}`);
  }

  return out
}

// ---------------------------------------------------------------------------
// Nguồn 2 — CellphoneS (sqlite, 55.010 sản phẩm)
// ---------------------------------------------------------------------------
function docCellphoneS(gioiHan?: number): SanPhamNguon[] {
  // `better-sqlite3` không có trong dependency. Đọc qua tệp JSON đã trích sẵn
  // để không phải thêm gói native chỉ cho một lần chạy — xem buoc-1-trich.js.
  const p = path.join(GOC_DU_LIEU, "CellphoneS/data/cellphones_medusa.json")
  if (!fs.existsSync(p)) {
    throw new Error(
      `Chưa có ${p}.\n` +
      `Chạy trước trên máy host:\n` +
      `  python3 "AI ECommerce Brain/apps/backend/src/scripts/trich-cellphones.py"`
    )
  }
  const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as any[]
  const out: SanPhamNguon[] = []

  for (const r of raw) {
    const gia = tienVND(r.special_price) || tienVND(r.price)
    const sku = String(r.sku ?? "").trim()
    if (!sku || gia <= 0) continue

    out.push({
      title: String(r.name ?? "").trim(),
      handle: slug(String(r.url_path ?? r.name ?? "").replace(/\.html$/, "")),
      description: String(r.description ?? "").slice(0, 2000),
      brand: r.brand ? String(r.brand) : undefined,
      loai: r.category ? String(r.category) : undefined,
      anh: (r.images ?? []).filter(Boolean),
      bienThe: [{ sku, tenTuyChon: "Mặc định", gia, tonKho: Number(r.stock ?? 0) || 0 }],
      specs: {
        store_type: "cellphones",
        brand: r.brand ?? null,
        category_path: r.category ?? null,
        ...(r.specs ?? {}),
      },
    })
    if (gioiHan && out.length >= gioiHan) break
  }
  return out
}

// ---------------------------------------------------------------------------
// Dựng nền cửa hàng: region VND, kênh bán, kho, hồ sơ vận chuyển, khoá công khai
// ---------------------------------------------------------------------------
async function dungNenCuaHang(container: any, logger: any) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
  const storeModule = container.resolve(Modules.STORE)

  let [channel] = await salesChannelModule.listSalesChannels({ name: "Default Sales Channel" })
  if (!channel) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: "Default Sales Channel" }] },
    })
    channel = result[0]
  }

  const [store] = await storeModule.listStores()
  if (store) {
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: store.id },
        update: {
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
        regions: [{
          name: "Việt Nam",
          currency_code: "vnd",
          countries: ["vn"],
          payment_providers: ["pp_system_default"],
        }],
      },
    })
    region = result[0]
    // ⚠️ PHẢI chỉ rõ `provider_id`.
    //
    // Bỏ trống thì `tax_region.provider_id` là NULL, và Medusa ném lỗi ngay khi
    // khách thêm món đầu tiên vào giỏ:
    //     Unable to retrieve the tax provider with id: null
    //     AwilixResolutionError: Could not resolve 'null'
    // Sản phẩm tìm được, giá đọc được, nhưng KHÔNG BÁN ĐƯỢC GÌ — và thông báo
    // lỗi không hề nhắc tới thuế nên rất dễ đi tìm nhầm hướng.
    // Phát hiện 29/07/2026 khi chat thử "cho anh 2 gói xà lách".
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
        locations: [{
          name: "Kho chính",
          address: { city: "Hồ Chí Minh", country_code: "vn", address_1: "" },
        }],
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
      input: { api_keys: [{ title: "Storefront", type: "publishable", created_by: "import-shop" }] },
    })
    apiKey = result[0]
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: { id: apiKey.id, add: [channel.id] },
    })
  }

  logger.info(`  ✓ Nền cửa hàng sẵn sàng · kênh bán ${channel.id}`)
  return { channel, shippingProfile, apiKey, query }
}

// ---------------------------------------------------------------------------
// Chạy chính
// ---------------------------------------------------------------------------
export default async function importShop({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  // Đọc từ BIẾN MÔI TRƯỜNG trước, rồi mới tới cờ dòng lệnh.
  //
  // `medusa exec script -- --co gia-tri` không truyền args qua nguyên vẹn ở
  // 2.17.2, nên biến môi trường là đường chắc ăn:
  //   docker compose exec -e NGUON=farmersmarket -e SO_LUONG=10 backend-x \
  //     sh -c "cd apps/backend && npx medusa exec ./src/scripts/import-shop.ts"
  const layCo = (ten: string) => {
    const i = (args ?? []).indexOf(`--${ten}`)
    return i >= 0 ? (args ?? [])[i + 1] : undefined
  }
  const nguon = process.env.NGUON ?? layCo("nguon")
  const soLuongRaw = process.env.SO_LUONG ?? layCo("so-luong")
  const soLuong = soLuongRaw ? Number(soLuongRaw) : undefined
  const coLo = Number(process.env.LO ?? layCo("lo") ?? 20)

  if (nguon !== "cellphones" && nguon !== "farmersmarket") {
    throw new Error("Thiếu hoặc sai --nguon. Chọn: cellphones | farmersmarket")
  }

  logger.info("═".repeat(64))
  logger.info(` IMPORT: ${nguon}${soLuong ? ` (giới hạn ${soLuong})` : " (toàn bộ)"}`)
  logger.info("═".repeat(64))

  const { channel, shippingProfile, apiKey, query } = await dungNenCuaHang(container, logger)

  logger.info("→ Đọc dữ liệu nguồn…")
  const nguonSP = nguon === "cellphones" ? docCellphoneS(soLuong) : docFarmersMarket(soLuong)
  logger.info(`  ✓ Đọc được ${nguonSP.length.toLocaleString("vi-VN")} sản phẩm hợp lệ`)

  // ═══ KHỬ TRÙNG — hai tầng ═══
  //
  // Tầng 1: handle đã có trong CSDL (chạy lại lần hai không tạo bản sao).
  // Tầng 2: SKU. Medusa bắt `variant.sku` DUY NHẤT toàn cửa hàng, và dữ liệu
  //   nguồn vi phạm điều đó: Farmers Market có 313 mã dùng lại cho nhiều sản
  //   phẩm (có mã lặp tới 10 lần). Không lọc thì createProductsWorkflow ném lỗi
  //   và mất CẢ LÔ — lần chạy đầu chỉ nạp được 1.440/4.066 vì lý do này.
  // ⚠️ query.graph CÓ PHÂN TRANG MẶC ĐỊNH.
  //
  // Gọi một lần rồi coi là "đã lấy hết" chỉ đọc được trang đầu. Lần chạy trước
  // vì thế bỏ sót phần lớn SKU đã có và 271 sản phẩm rớt với lỗi
  // "Product variant with sku ... already exists". Đây đúng loại lỗi mà bản cũ
  // của job đồng bộ Meilisearch từng mắc: đồng bộ trang đầu nhưng vẫn log
  // "Hoàn tất". Phải lặp cho tới khi trang rỗng.
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
  logger.info(`  ✓ CSDL đang có ${handleDaCo.size.toLocaleString("vi-VN")} sản phẩm · ${skuDaCo.size.toLocaleString("vi-VN")} SKU`)

  let boQuaHandle = 0
  let boQuaSku = 0
  let doiSku = 0
  const canTao: SanPhamNguon[] = []

  for (const s of nguonSP) {
    if (!s.handle) continue
    if (handleDaCo.has(s.handle)) { boQuaHandle++; continue }

    // Bỏ biến thể có SKU đã dùng — kiểm ba nguồn trùng, giữ lần xuất hiện đầu:
    //   1. SKU đã có trong CSDL
    //   2. SKU đã dùng ở sản phẩm TRƯỚC trong cùng lần chạy
    //   3. SKU lặp NGAY TRONG chính sản phẩm này
    //
    // Bỏ sót (3) là lỗi thật đã xảy ra: dùng `filter` rồi mới thêm cả loạt vào
    // tập khiến hai biến thể trùng SKU trong cùng sản phẩm đều lọt qua, vì lúc
    // lọc thì chưa cái nào nằm trong tập. Medusa từ chối cả sản phẩm với thông
    // báo "already exists" dù SKU đó chưa hề có trong CSDL — rất dễ đi tìm nhầm
    // hướng.
    //
    // ⚠️ TRÙNG SKU THÌ ĐỔI SỐ HIỆU, ĐỪNG VỨT SẢN PHẨM.
    //
    // Bản trước bỏ hẳn biến thể trùng, và khi MỌI biến thể đều trùng thì bỏ cả
    // sản phẩm (`boQuaSku++; continue`). Nguồn Farmers Market dùng lại 313 mã
    // cho nhiều mặt hàng khác nhau, nên 52 sản phẩm có handle riêng, tên riêng,
    // giá riêng đã bị loại chỉ vì trùng mã với mặt hàng nhập trước.
    //
    // Chúng là hàng THẬT, không phải bản sao. Nay giữ lại và gắn hậu tố suy ra
    // từ handle — vẫn duy nhất, vẫn ổn định giữa các lần chạy.
    const bienTheSach: typeof s.bienThe = []
    const skuTrongSanPham = new Set<string>()
    for (const [i, v] of s.bienThe.entries()) {
      let sku = v.sku
      if (skuDaCo.has(sku) || skuTrongSanPham.has(sku)) {
        const thay = `${sku}-${slug(s.handle).slice(0, 30)}${s.bienThe.length > 1 ? `-${i + 1}` : ""}`
        // Vẫn trùng nữa thì mới chịu bỏ biến thể này.
        if (skuDaCo.has(thay) || skuTrongSanPham.has(thay)) continue
        sku = thay
        doiSku++
      }
      skuTrongSanPham.add(sku)
      bienTheSach.push({ ...v, sku })
    }
    if (bienTheSach.length === 0) { boQuaSku++; continue }

    bienTheSach.forEach((v) => skuDaCo.add(v.sku))
    handleDaCo.add(s.handle)
    canTao.push({ ...s, bienThe: bienTheSach })
  }

  logger.info(
    `  ✓ ${canTao.length.toLocaleString("vi-VN")} cần tạo · ` +
    `${boQuaHandle.toLocaleString("vi-VN")} trùng handle · ` +
    `${boQuaSku.toLocaleString("vi-VN")} trùng SKU · ` +
    `${doiSku.toLocaleString("vi-VN")} SKU được đổi số hiệu`
  )

  if (canTao.length === 0) {
    logger.info(" Không có gì để nạp.")
    return
  }

  // ═══ BẢNG ĐỐI CHIẾU TIỀN TỆ (ADR-010) ═══
  // In giá gốc của 10 sản phẩm đầu để đối chiếu bằng mắt với giá đọc lại qua
  // Store API. VND zero-decimal — sai ở đây là sai lệch 100 lần trên mọi đơn.
  logger.info("")
  logger.info("┌─ ĐỐI CHIẾU TIỀN TỆ — so con số dưới đây với Store API sau khi nạp")
  for (const s of canTao.slice(0, 10)) {
    const v = s.bienThe[0]
    logger.info(`│  ${v.sku.padEnd(22)} ${String(v.gia).padStart(12)} đ   ${s.title.slice(0, 45)}`)
  }
  logger.info("└─ Nếu Store API trả về con số khác, DỪNG LẠI, đừng nạp tiếp.")
  logger.info("")

  const payload = canTao.map((s) => {
    const tenTuyChon = "Quy cách"
    const giaTri = Array.from(new Set(s.bienThe.map((v) => v.tenTuyChon)))
    return {
      title: s.title,
      handle: s.handle,
      description: s.description,
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      thumbnail: s.anh[0] || null,
      images: s.anh.slice(0, 8).map((url) => ({ url })),
      options: [{ title: tenTuyChon, values: giaTri }],
      variants: s.bienThe.map((v) => ({
        title: `${s.title} — ${v.tenTuyChon}`.slice(0, 250),
        sku: v.sku,
        manage_inventory: false,
        options: { [tenTuyChon]: v.tenTuyChon },
        prices: [{ amount: v.gia, currency_code: "vnd" }],
      })),
      sales_channels: [{ id: channel.id }],
      // metadata.specs là thứ Meilisearch dùng để lọc cứng (RAM, hãng, xuất xứ).
      // Bản 1.0 để `specs: {}` rỗng khiến mọi bộ lọc trả về 0 kết quả.
      metadata: { specs: s.specs, ton_kho_nguon: s.bienThe[0]?.tonKho ?? 0 },
    }
  })

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
      // lỗi là mất trắng 39 sản phẩm tốt còn lại. Lần chạy đầu mất 2.626/4.066
      // sản phẩm Farmers Market đúng vì lý do này. Thử lại từng cái chậm hơn
      // nhưng chỉ mất đúng cái hỏng, và chỉ trả giá đó khi thật sự có lỗi.
      logger.warn(`  ⚠ Lô ${i}–${i + lo.length} hỏng, thử lại từng sản phẩm…`)
      for (const sp of lo) {
        try {
          await createProductsWorkflow(container).run({ input: { products: [sp] } })
          daTao++
        } catch (e2: any) {
          loi++
          if (loi <= 20) {
            logger.error(`    ✖ ${(sp as any).handle}: ${String(e2?.message ?? e2).slice(0, 160)}`)
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
  logger.info("═".repeat(64))
  logger.info(` ĐÃ NẠP ${daTao.toLocaleString("vi-VN")} SẢN PHẨM`)
  if (loi > 0) logger.warn(` ✖ ${loi.toLocaleString("vi-VN")} sản phẩm KHÔNG nạp được (xem log ở trên)`)
  logger.info(` Publishable key: ${(apiKey as any).token ?? "(xem Admin → Developer)"}`)
  logger.info("═".repeat(64))
  logger.info(" BƯỚC TIẾP THEO — bắt buộc trước khi nạp toàn bộ:")
  logger.info("   1. Mở Store API đọc lại giá, đối chiếu bảng ở trên")
  logger.info("   2. Khớp → chạy lại không có --so-luong để nạp hết")
  logger.info("   3. Lệch → DỪNG, kiểm tra quy ước zero-decimal của VND")
}
