import { model } from "@medusajs/framework/utils"

/**
 * THẺ BLOG (Blog Tag)
 * name đa ngôn ngữ (JSON map theo locale). slug không dịch.
 */
const BlogTag = model.define("blog_tag", {
  id: model.id().primaryKey(),
  slug: model.text().unique(),
  name: model.json().nullable(),
})

export default BlogTag
