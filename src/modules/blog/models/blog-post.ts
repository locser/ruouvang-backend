import { model } from "@medusajs/framework/utils"

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  BÀI VIẾT BLOG (Blog Post)
 * ═══════════════════════════════════════════════════════════════════════
 *  Đa ngôn ngữ: các trường CHỮ hiển thị cho khách (title/excerpt/content/
 *  seo_*) lưu dạng JSON map theo locale BCP-47:  {"vi-VN": "...", "en-US": "..."}.
 *  Admin bật bao nhiêu locale (Translation Module) thì form hiện bấy nhiêu ô,
 *  và store trả về đúng locale đang xem (fallback về vi-VN → khoá đầu có nội dung).
 *
 *  Quan hệ: theo đúng lối của page_builder — dùng TEXT id + JSON mảng id,
 *  KHÔNG dùng quan hệ hình thức (né phức tạp migration). Ghép ở tầng service.
 *
 *  ⚠️ KHÔNG khai created_at / updated_at / deleted_at — Medusa DML tự thêm.
 *  ⚠️ Trường json() MERGE khi update và chuỗi rỗng "" XOÁ hẳn khoá →
 *     validators đổi "" → null, và API luôn gửi TRỌN VẸN object.
 * ═══════════════════════════════════════════════════════════════════════
 */
const BlogPost = model.define("blog_post", {
  id: model.id().primaryKey(),

  /** Định danh trên URL: /blog/<slug>. Duy nhất toàn hệ. */
  slug: model.text().unique(),

  /** draft = đang soạn (storefront KHÔNG trả) · published = khách xem được */
  status: model.enum(["draft", "published"]).default("draft"),

  /** Thời điểm đăng. Nếu ở tương lai → chưa hiện. Null = hiện ngay khi published. */
  published_at: model.dateTime().nullable(),

  /** Ảnh bìa (URL). Không dịch. */
  thumbnail: model.text().nullable(),

  /** Trỏ tới blog_author.id (không dịch — tên riêng). */
  author_id: model.text().index("IDX_blog_post_author_id").nullable(),

  /** Mảng blog_category.id (JSON). Lọc theo danh mục ở tầng service. */
  category_ids: model.json().nullable(),

  /** Mảng blog_tag.id (JSON). */
  tag_ids: model.json().nullable(),

  /** Ghim bài nổi bật. */
  is_featured: model.boolean().default(false),

  // ─────────── Trường ĐA NGÔN NGỮ: JSON map { [locale]: string } ───────────
  title: model.json().nullable(),
  excerpt: model.json().nullable(),
  /** Nội dung dạng Markdown, theo từng locale. */
  content: model.json().nullable(),
  seo_title: model.json().nullable(),
  seo_description: model.json().nullable(),

  metadata: model.json().nullable(),
})

export default BlogPost
