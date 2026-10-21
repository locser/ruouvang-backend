/**
 * Nạp blog thật đã cào từ https://www.cwwines.com/blogs/news.
 *
 * Chạy trong backend C.W. Wines:
 *   npx medusa exec ./src/scripts/seed-blog-cwwines.ts
 *
 * Idempotent theo slug: bài đã có được bảo toàn để không ghi đè chỉnh sửa
 * của đội nội dung. Crawler giữ tiếng Anh gốc và sinh bản dịch tiếng Việt.
 */
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { BLOG_MODULE } from "../modules/blog"
import type BlogModuleService from "../modules/blog/service"

// Dữ liệu cào nằm trong repo backend: scripts/scrapers/data.
const FILE_BLOG = path.resolve(process.cwd(), "scripts/scrapers/data/cwwines-blog.json")

interface BaiCao {
  handle: string
  url: string
  title: string
  titleVi: string
  description: string
  descriptionVi: string
  image: string | null
  publishedAt: string | null
  author: string
  content: string
  contentVi: string
}

function docBlog(): BaiCao[] {
  if (!fs.existsSync(FILE_BLOG)) {
    throw new Error(
      `Không có ${FILE_BLOG}. Chạy trước: node scripts/scrapers/crawl-cwwines.js`
    )
  }
  const data = JSON.parse(fs.readFileSync(FILE_BLOG, "utf-8"))
  if (!Array.isArray(data)) throw new Error(`${path.basename(FILE_BLOG)} không phải mảng JSON`)
  return data.filter((b) => b?.handle && b?.title)
}

export default async function seedBlogCwWines({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service: BlogModuleService = container.resolve(BLOG_MODULE)
  const baiCao = docBlog()

  logger.info(`═══ Seed Blog C.W. Wines: ${baiCao.length} bài cào thật ═══`)

  let [author] = await service.listBlogAuthors({ name: "C.W. Wines Team" })
  if (!author) {
    ;[author] = await service.createBlogAuthors([
      {
        name: "C.W. Wines Team",
        bio: {
          "vi-VN": "Đội ngũ C.W. Wines chia sẻ tin tức, vùng trồng và câu chuyện rượu vang Australia.",
          "en-US": "The C.W. Wines team shares Australian wine news, regions and producer stories.",
        },
        avatar: null,
      },
    ])
  }

  let [category] = await service.listBlogCategories({ slug: "news" })
  if (!category) {
    ;[category] = await service.createBlogCategories([
      {
        slug: "news",
        rank: 1,
        name: { "vi-VN": "Tin tức rượu vang", "en-US": "Wine news" },
        description: {
          "vi-VN": "Tin tức và kiến thức từ C.W. Wines.",
          "en-US": "News and knowledge from C.W. Wines.",
        },
      },
    ])
  }

  let daTao = 0
  let boQua = 0
  for (const bai of baiCao) {
    const [daCo] = await service.listBlogPosts({ slug: bai.handle })
    if (daCo) {
      boQua++
      continue
    }
    const publishedAt = bai.publishedAt ? new Date(bai.publishedAt) : new Date()
    // Module service sinh overload cho một bản ghi dù runtime nhận mảng như
    // các create* còn lại; API admin của repo cũng dùng cách gọi này.
    await (service.createBlogPosts as any)([
      {
        slug: bai.handle,
        status: "published",
        published_at: Number.isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
        thumbnail: bai.image,
        author_id: author.id,
        category_ids: [category.id],
        tag_ids: [],
        is_featured: daTao < 3,
        title: {
          "vi-VN": bai.titleVi || bai.title,
          "en-US": bai.title,
        },
        excerpt: {
          "vi-VN": bai.descriptionVi || bai.description || bai.titleVi || bai.title,
          "en-US": bai.description || bai.title,
        },
        content: {
          "vi-VN": bai.contentVi || bai.content,
          "en-US": bai.content,
        },
        seo_title: {
          "vi-VN": `${bai.titleVi || bai.title} | C.W. Wines`,
          "en-US": `${bai.title} | C.W. Wines`,
        },
        seo_description: {
          "vi-VN": bai.descriptionVi || bai.description || bai.titleVi || bai.title,
          "en-US": bai.description || bai.title,
        },
      },
    ])
    daTao++
  }

  logger.info(`✓ Blog C.W. Wines: ${daTao} bài mới · ${boQua} bài đã có`)
}
