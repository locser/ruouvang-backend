/**
 * ═══════════════════════════════════════════════════════════════════════
 *  CẤU HÌNH INDEX MEILISEARCH + ĐỒNG BỘ TOÀN BỘ LẦN ĐẦU
 *
 *  Chạy trong container của từng shop:
 *    docker compose exec backend-cellphones \
 *      sh -c "cd apps/backend && npx medusa exec ./src/scripts/sync-meili.ts"
 *
 *  ⚠️ VÌ SAO PHẦN CẤU HÌNH INDEX LÀ BẮT BUỘC, KHÔNG PHẢI TUỲ CHỌN
 *
 *  Meilisearch CHỈ lọc được trên trường nằm trong `filterableAttributes`.
 *  Trường không khai báo mà đem lọc thì API trả lỗi 400, và `timSanPham()`
 *  sẽ rơi xuống bậc nới lỏng cuối cùng ở mọi truy vấn.
 *
 *  Nguy hiểm nhất: `tenant_id` KHÔNG khai báo nghĩa là bộ lọc cách ly tenant
 *  không chạy được. Đó là ADR-011 — "rò dữ liệu chéo tenant = 0" — nên đây
 *  không phải chuyện tinh chỉnh hiệu năng mà là chuyện cách ly dữ liệu.
 *
 *  Toàn bộ index dùng CHUNG cho ba shop (ADR-005: một index `products`), cách
 *  ly bằng bộ lọc `tenant_id` mà `dungBoLoc()` luôn đặt ở vị trí đầu tiên.
 * ═══════════════════════════════════════════════════════════════════════
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  layCauHinhMeili,
  layTenantId,
  docTrangSanPham,
  dayLenMeili,
} from "../lib/meili-sync"

const LO_DOC = 500

/**
 * Trường được phép dùng trong biểu thức `filter`.
 *
 * Danh sách này phải khớp với `dungBoLoc()` bên
 * ChatBotAISAAS/src/services/search.ts — lệch một tên là bộ lọc đó im lặng
 * không có tác dụng, hoặc Meilisearch trả 400 cho cả truy vấn.
 */
const TRUONG_LOC = [
  "tenant_id",        // ⚠️ CÁCH LY TENANT — không có nó là hỏng ADR-011
  "sku",              // laySkuHopLe() dùng để kiểm chứng SKU do LLM sinh ra
  // Storefront tra sản phẩm theo handle ở trang chi tiết (/san-pham/<handle>).
  // Thiếu trường này thì Meilisearch trả 400 "Attribute `handle` is not
  // filterable", storefront bắt lỗi rồi hiện 404 — MỌI trang chi tiết đều chết
  // trong khi trang danh sách vẫn bình thường, rất dễ tưởng là lỗi định tuyến.
  "handle",
  "store_type",
  "brand",
  "category_path",
  "price_vnd",
  "in_stock",
  "specs.ram_gb",
  "specs.storage_gb",
  "specs.battery_mah",
  "specs.screen_inch",
  "specs.storage_condition",
  "specs.origin_region",
  "specs.organic_certified",
  "specs.chipset",
  "specs.brand",
  // Hai trường dưới đây là XƯƠNG SỐNG của bộ lọc storefront:
  //   product_type → danh mục (Farmers Market có 171 loại: Bánh, Trái cây nhập…)
  //   vendor       → xuất xứ / thương hiệu, hiện thành badge trên thẻ sản phẩm
  // Thiếu chúng thì sidebar lọc không có gì để lọc.
  "specs.product_type",
  "specs.vendor",
  // ── Thuộc tính rượu vang (shop Red Apron) — BỔ SUNG 07/08/2026 ────────────
  //
  // Báo cáo kiểm thử ngày 05/08/2026 ghi BUG-R06: trang danh mục rượu vang đỏ
  // có 2.096 sản phẩm mà KHÔNG có bộ lọc nào — khách phải bấm "Xem thêm" khoảng
  // 43 lần mới xem hết. Với ngành rượu thì lọc theo quốc gia, vùng trồng và
  // giống nho gần như bắt buộc.
  //
  // Năm khoá dưới đây do `seed-redapron.ts` ghi vào `metadata.specs`, bóc từ tag
  // Haravan dạng `Country_Pháp`, `Grape_Merlot`, `Capacity_750ml`.
  //
  // ⚠️ PHẢI CHẠY LẠI script này sau khi triển khai, nếu không Meilisearch trả
  // HTTP 400 "Attribute `specs.xuat_xu` is not filterable" và bộ lọc trên
  // storefront sẽ im lặng rơi về danh sách không lọc:
  //     pnpm --filter backend exec medusa exec ./src/scripts/sync-meili.ts
  "specs.xuat_xu",
  "specs.vung_trong",
  "specs.giong_nho",
  "specs.dung_tich",
  "specs.nong_do",
  "specs.loai",
  "specs.thuong_hieu",
  "tags",
]

const TRUONG_XEP = ["price_vnd", "popularity", "updated_at"]

/**
 * Thứ tự có ý nghĩa: Meilisearch xếp hạng theo thứ tự khai báo, khớp ở trường
 * đứng trước được coi là liên quan hơn. Tên sản phẩm quan trọng hơn mô tả.
 */
const TRUONG_TIM = ["title", "sku", "brand", "searchable_text", "category_path"]

async function datCauHinhIndex(logger: any) {
  const { host, key, index } = layCauHinhMeili()

  const goi = async (duongDan: string, body: unknown) => {
    const res = await fetch(`${host}/indexes/${index}${duongDan}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      throw new Error(`Meili ${duongDan} lỗi ${res.status}: ${(await res.text()).slice(0, 300)}`)
    }
    return res.json()
  }

  // Tạo index nếu chưa có. `primaryKey: id` là product.id của Medusa (ADR-005).
  const taoRes = await fetch(`${host}/indexes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ uid: index, primaryKey: "id" }),
  })
  if (taoRes.ok) logger.info(`  ✓ Đã tạo index '${index}'`)
  else logger.info(`  ✓ Index '${index}' đã có sẵn`)

  // ⚠️ ĐẶT KHOÁ CHÍNH KỂ CẢ KHI INDEX ĐÃ TỒN TẠI.
  //
  // Index được tạo bởi đường khác (ví dụ `dayLenMeili` tự tạo khi đẩy lô đầu)
  // sẽ KHÔNG có primaryKey. Meilisearch khi đó phải tự suy ra và gặp HAI trường
  // kết thúc bằng `id` — `id` và `tenant_id` — nên từ chối:
  //     index_primary_key_multiple_candidates_found
  // Mọi tác vụ thêm document đều FAILED, mà `dayLenMeili` chỉ chờ nhận tác vụ
  // chứ không chờ kết quả, nên script vẫn báo "ĐÃ ĐẨY 45.052 DOCUMENT" trong
  // khi index rỗng trơn. Đã xảy ra thật ngày 28/07/2026: 48.434 tác vụ hỏng.
  const ttRes = await fetch(`${host}/indexes/${index}`, {
    headers: { Authorization: `Bearer ${key}` },
  })
  const tt = ttRes.ok ? await ttRes.json() : {}
  if (tt.primaryKey !== "id") {
    const patch = await fetch(`${host}/indexes/${index}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ primaryKey: "id" }),
    })
    if (!patch.ok) {
      throw new Error(
        `Không đặt được primaryKey='id' (hiện là ${JSON.stringify(tt.primaryKey)}): ` +
        `${(await patch.text()).slice(0, 200)}\n` +
        `Meilisearch chỉ cho đổi khoá chính khi index RỖNG. Xoá index rồi chạy lại:\n` +
        `  curl -X DELETE -H "Authorization: Bearer <key>" ${host}/indexes/${index}`
      )
    }
    logger.info(`  ✓ Đã đặt primaryKey='id'`)
  } else {
    logger.info(`  ✓ primaryKey='id' đã đúng`)
  }

  await goi("/settings/filterable-attributes", TRUONG_LOC)
  logger.info(`  ✓ ${TRUONG_LOC.length} trường lọc (có tenant_id — cách ly tenant)`)

  await goi("/settings/sortable-attributes", TRUONG_XEP)
  logger.info(`  ✓ ${TRUONG_XEP.length} trường sắp xếp`)

  await goi("/settings/searchable-attributes", TRUONG_TIM)
  logger.info(`  ✓ ${TRUONG_TIM.length} trường tìm kiếm`)

  // ⚠️ HAI TRẦN MẶC ĐỊNH CỦA MEILISEARCH ÂM THẦM LÀM SAI SỐ LIỆU
  //
  // `maxTotalHits` mặc định 1000: mọi truy vấn trả về đúng 1000 dù có 45.052
  // sản phẩm. Storefront hiện "1.000 sản phẩm đang bán" và phân trang dừng ở
  // trang 42. Không có lỗi nào, chỉ là con số sai.
  //
  // `maxValuesPerFacet` mặc định 100: Farmers Market có 171 danh mục nên 71
  // danh mục biến mất khỏi menu và sidebar mà không ai biết.
  const patch = async (duongDan: string, body: unknown) => {
    const res = await fetch(`${host}/indexes/${index}${duongDan}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Meili ${duongDan} lỗi ${res.status}`)
  }
  await patch("/settings/pagination", { maxTotalHits: 100_000 })
  await patch("/settings/faceting", { maxValuesPerFacet: 300 })
  logger.info(`  ✓ trần kết quả 100.000 · trần giá trị facet 300`)
}

export default async function syncMeili({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const tenantId = layTenantId()
  const { index } = layCauHinhMeili()

  logger.info("═".repeat(64))
  logger.info(` ĐỒNG BỘ MEILISEARCH · index '${index}' · tenant ${tenantId}`)
  logger.info("═".repeat(64))

  logger.info("→ Cấu hình index…")
  await datCauHinhIndex(logger)

  logger.info("→ Đọc sản phẩm từ PostgreSQL và đẩy lên…")
  let offset = 0
  let tong = 0
  const batDau = Date.now()

  // Phân trang tới khi hết. KHÔNG gọi một lần rồi coi là xong: đó chính là lỗi
  // của bản trước — đồng bộ trang đầu nhưng vẫn ghi log "Hoàn tất".
  for (;;) {
    const docs = await docTrangSanPham(LO_DOC, offset)
    if (docs.length === 0) break

    await dayLenMeili(docs)
    tong += docs.length
    offset += docs.length

    const giay = (Date.now() - batDau) / 1000
    logger.info(`  … ${tong.toLocaleString("vi-VN")} document · ${(tong / Math.max(giay, 1)).toFixed(0)}/s`)

    if (docs.length < LO_DOC) break
  }

  // ═══ KIỂM CHỨNG — KHÔNG BAO GIỜ BÁO THÀNH CÔNG MÀ CHƯA ĐỐI CHIẾU ═══
  //
  // `dayLenMeili` chỉ chờ Meilisearch NHẬN tác vụ, không chờ xử lý xong. Tác vụ
  // có thể FAILED sau đó (khoá chính sai, trường lọc chưa khai báo…) mà script
  // vẫn in "ĐÃ ĐẨY N DOCUMENT". Phải đọc lại số thật.
  const { host, key } = layCauHinhMeili()
  logger.info("→ Đợi Meilisearch xử lý xong…")

  let soThat = 0
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const res = await fetch(`${host}/indexes/${index}/stats`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!res.ok) continue
    const st = await res.json()
    soThat = st.numberOfDocuments ?? 0
    if (!st.isIndexing) break
  }

  // Đếm tác vụ hỏng CỦA LẦN CHẠY NÀY.
  //
  // Meilisearch giữ toàn bộ lịch sử tác vụ, nên `?statuses=failed` không lọc
  // theo thời gian sẽ đếm cả những lần hỏng từ các lần chạy trước và báo động
  // giả — đã tự vấp ngày 28/07/2026 (đếm ra 49.137 tác vụ hỏng cũ trong khi
  // lần chạy hiện tại hoàn toàn sạch).
  const tuLuc = new Date(batDau).toISOString()
  const tRes = await fetch(
    `${host}/tasks?statuses=failed&afterEnqueuedAt=${encodeURIComponent(tuLuc)}&limit=1`,
    { headers: { Authorization: `Bearer ${key}` } }
  )
  const tJson = tRes.ok ? await tRes.json() : { total: 0, results: [] }
  const soHong = tJson.total ?? 0

  logger.info("")
  logger.info("═".repeat(64))
  logger.info(` Đã gửi     : ${tong.toLocaleString("vi-VN")} document`)
  logger.info(` Trong index: ${soThat.toLocaleString("vi-VN")} document (tổng cả 3 shop)`)
  if (soHong > 0) {
    logger.error(` ✖ ${soHong.toLocaleString("vi-VN")} TÁC VỤ HỎNG trong lần chạy này`)
    const loi = tJson.results?.[0]?.error
    if (loi) logger.error(`   Lỗi gần nhất: ${loi.message}`)
    logger.error(" ĐỒNG BỘ CHƯA THÀNH CÔNG — đừng coi là xong.")
  } else {
    logger.info(" ✓ Không có tác vụ hỏng trong lần chạy này")
  }
  logger.info("═".repeat(64))
}
