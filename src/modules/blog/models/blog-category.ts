import { model } from "@medusajs/framework/utils"

/**
 * DANH MỤC BLOG (Blog Category)
 * name/description đa ngôn ngữ (JSON map theo locale). slug không dịch (dùng cho URL/lọc).
 */
const BlogCategory = model.define("blog_category", {
  id: model.id().primaryKey(),
  slug: model.text().unique(),
  name: model.json().nullable(),
  description: model.json().nullable(),
  /** Thứ tự hiển thị trong bộ lọc, nhỏ → trước. */
  rank: model.number().default(0),
  metadata: model.json().nullable(),
})

export default BlogCategory
