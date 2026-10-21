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
// Danh sách trường lọc/sắp xếp/tìm và bước cấu hình index nằm ở lib để nút
// "Đồng bộ toàn bộ" trong admin dùng chung — sửa trường lọc thì sửa ở đó.
import { datCauHinhIndex } from "../lib/meili-dong-bo-toan-bo"

const LO_DOC = 500

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
