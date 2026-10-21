import { model } from "@medusajs/framework/utils"

/**
 * TÁC GIẢ BLOG (Blog Author)
 * name là tên riêng — KHÔNG dịch. bio đa ngôn ngữ (JSON map theo locale).
 */
const BlogAuthor = model.define("blog_author", {
  id: model.id().primaryKey(),
  name: model.text(),
  bio: model.json().nullable(),
  avatar: model.text().nullable(),
})

export default BlogAuthor
