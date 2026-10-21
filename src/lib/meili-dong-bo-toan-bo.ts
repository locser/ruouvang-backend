import {
  layCauHinhMeili,
  docTrangSanPham,
  dayLenMeili,
  xoaKhoiMeili,
  docToanBoIdTrongIndex,
  layPool,
  TaiLieuSanPham,
} from "./meili-sync"

/**
 * ĐỒNG BỘ TOÀN BỘ SẢN PHẨM LÊN MEILISEARCH — logic dùng chung.
 *
 * Được gọi từ ba nơi:
 *   - job đêm `meilisearch-nightly-reconcile` (03:00)
 *   - POST /admin/meili/dong-bo-toan-bo (nút "Đồng bộ toàn bộ" trên trang Sản phẩm)
 *   - script `sync-meili.ts` (chỉ phần cấu hình index)
 *
 * Nút trong admin tồn tại vì trên máy chủ Docker người vận hành không có quyền
 * chạy `medusa exec` — trước đây đồng bộ toàn bộ chỉ làm được bằng lệnh.
 */

const LO_DOC = 500 // số sản phẩm đọc mỗi trang từ PostgreSQL
const LO_DAY = 500 // số document đẩy mỗi lô lên Meilisearch

/**
 * Trường được phép dùng trong biểu thức `filter`.
 *
 * Danh sách này phải khớp với `dungBoLoc()` bên
 * ChatBotAISAAS/src/services/search.ts — lệch một tên là bộ lọc đó im lặng
 * không có tác dụng, hoặc Meilisearch trả 400 cho cả truy vấn.
 */
export const TRUONG_LOC = [
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

export const TRUONG_XEP = ["price_vnd", "popularity", "updated_at"]

/**
 * Thứ tự có ý nghĩa: Meilisearch xếp hạng theo thứ tự khai báo, khớp ở trường
 * đứng trước được coi là liên quan hơn. Tên sản phẩm quan trọng hơn mô tả.
 */
export const TRUONG_TIM = ["title", "sku", "brand", "searchable_text", "category_path"]

export async function datCauHinhIndex(logger: any): Promise<void> {
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
  //
  // Phải HỎI TRƯỚC rồi mới tạo: POST /indexes luôn trả 202 kể cả khi index đã
  // có, rồi tác vụ mới FAILED `index_already_exists`. Mỗi lần đồng bộ để lại một
  // tác vụ hỏng giả, và nút "Đồng bộ toàn bộ" (đếm tác vụ hỏng) sẽ báo lỗi oan.
  const coRes = await fetch(`${host}/indexes/${index}`, {
    headers: { Authorization: `Bearer ${key}` },
  })
  if (coRes.status === 404) {
    const taoRes = await fetch(`${host}/indexes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ uid: index, primaryKey: "id" }),
    })
    if (!taoRes.ok) throw new Error(`Không tạo được index '${index}': ${(await taoRes.text()).slice(0, 200)}`)
    logger.info(`  ✓ Đã tạo index '${index}'`)
  } else {
    logger.info(`  ✓ Index '${index}' đã có sẵn`)
  }

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

export interface KetQuaDoiSoat {
  tong_trong_medusa: number
  da_doc: number
  them_moi: number
  cap_nhat: number
  xoa_mo_coi: number
  khop_san: number
  ty_le_lech: number
  giay: number
}

/**
 * Đối soát BA CHIỀU giữa Medusa và index: thiếu → thêm · thừa → xoá ·
 * lệch updated_at → cập nhật. Đọc Medusa theo trang tới khi hết.
 */
export async function doiSoatMeili(): Promise<KetQuaDoiSoat> {
  const batDau = Date.now()

  // --- Bước 1: tổng số sản phẩm published, để đối chiếu cuối cùng ---
  const dem = await layPool().query(
    `SELECT COUNT(*)::int AS n FROM product WHERE deleted_at IS NULL AND status = 'published'`
  )
  const tongTrongMedusa: number = dem.rows[0]?.n ?? 0

  // --- Bước 2: ảnh chụp hiện trạng index ---
  const trongIndex = await docToanBoIdTrongIndex()

  // --- Bước 3: duyệt toàn bộ Medusa theo trang, so từng sản phẩm ---
  const daThay = new Set<string>()
  let themMoi = 0
  let capNhat = 0
  let khongDoi = 0
  let daDoc = 0
  let hangCho: TaiLieuSanPham[] = []

  const dayHangCho = async () => {
    if (hangCho.length === 0) return
    await dayLenMeili(hangCho)
    hangCho = []
  }

  for (let offset = 0; ; offset += LO_DOC) {
    const trang = await docTrangSanPham(LO_DOC, offset)
    if (trang.length === 0) break
    daDoc += trang.length

    for (const doc of trang) {
      daThay.add(doc.id)
      const uaTrongIndex = trongIndex.get(doc.id)
      if (uaTrongIndex === undefined) {
        themMoi++
        hangCho.push(doc)
      } else if (uaTrongIndex !== doc.updated_at) {
        capNhat++
        hangCho.push(doc)
      } else {
        khongDoi++
      }
      if (hangCho.length >= LO_DAY) await dayHangCho()
    }

    if (trang.length < LO_DOC) break
  }
  await dayHangCho()

  // --- Bước 4: xoá document mồ côi (có trong index, không còn published) ---
  const moCoi: string[] = []
  for (const id of trongIndex.keys()) {
    if (!daThay.has(id)) moCoi.push(id)
  }
  for (let i = 0; i < moCoi.length; i += LO_DAY) {
    await xoaKhoiMeili(moCoi.slice(i, i + LO_DAY))
  }

  const tongLech = themMoi + capNhat + moCoi.length
  return {
    tong_trong_medusa: tongTrongMedusa,
    da_doc: daDoc,
    them_moi: themMoi,
    cap_nhat: capNhat,
    xoa_mo_coi: moCoi.length,
    khop_san: khongDoi,
    ty_le_lech: tongTrongMedusa > 0 ? (tongLech / tongTrongMedusa) * 100 : 0,
    giay: Math.round((Date.now() - batDau) / 1000),
  }
}

export interface KetQuaXuLyMeili {
  so_trong_index: number
  so_tac_vu_hong: number
  loi_gan_nhat: string | null
  con_dang_xu_ly: boolean
}

/**
 * Đợi Meilisearch xử lý xong các tác vụ vừa gửi rồi đếm tác vụ HỎNG từ `tuLuc`.
 *
 * `dayLenMeili` chỉ chờ Meilisearch NHẬN tác vụ; tác vụ vẫn có thể FAILED sau
 * đó (khoá chính sai, trường lọc chưa khai báo…). Không đếm thì nút sẽ báo
 * "đã đồng bộ" trong khi index rỗng. Chỉ đếm tác vụ từ `tuLuc` — lịch sử tác vụ
 * hỏng của các lần trước không được tính (đã báo động giả ngày 28/07/2026).
 */
export async function choMeiliXuLy(tuLuc: number, toiDaGiay = 60): Promise<KetQuaXuLyMeili> {
  const { host, key, index } = layCauHinhMeili()
  const auth = { Authorization: `Bearer ${key}` }

  let soThat = 0
  let conDangXuLy = true
  for (let i = 0; i < Math.ceil(toiDaGiay / 2); i++) {
    const res = await fetch(`${host}/indexes/${index}/stats`, { headers: auth })
    if (res.ok) {
      const st: any = await res.json()
      soThat = st.numberOfDocuments ?? 0
      if (!st.isIndexing) {
        conDangXuLy = false
        break
      }
    }
    await new Promise((r) => setTimeout(r, 2000))
  }

  const tRes = await fetch(
    `${host}/tasks?statuses=failed&afterEnqueuedAt=${encodeURIComponent(new Date(tuLuc).toISOString())}&limit=1`,
    { headers: auth }
  )
  const tJson: any = tRes.ok ? await tRes.json() : { total: 0, results: [] }

  return {
    so_trong_index: soThat,
    so_tac_vu_hong: tJson.total ?? 0,
    loi_gan_nhat: tJson.results?.[0]?.error?.message ?? null,
    con_dang_xu_ly: conDangXuLy,
  }
}
