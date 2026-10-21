import { model } from "@medusajs/framework/utils"

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  MẪU TRANG (Page Template)
 * ═══════════════════════════════════════════════════════════════════════
 *  Một trang của storefront: "home", "gioi-thieu", "quy-trinh-len-men"…
 *  Không chứa nội dung — nội dung nằm ở các PageSection trỏ vào đây.
 *
 *  ⚠️ KHÔNG khai báo created_at / updated_at / deleted_at —
 *     Medusa DML tự thêm 3 trường này.
 * ═══════════════════════════════════════════════════════════════════════
 */
const PageTemplate = model.define("page_template", {
  id: model.id().primaryKey(),

  /** Định danh trên URL: "home" → trang chủ. Duy nhất toàn hệ. */
  handle: model.text().unique(),

  /** Tên hiển thị trong Admin (không hiện ra khách). */
  title: model.text().searchable(),

  /**
   * draft   = đang soạn, storefront KHÔNG trả về
   * published = khách xem được
   */
  status: model.enum(["draft", "published"]).default("draft"),

  metadata: model.json().nullable(),
})

export default PageTemplate
