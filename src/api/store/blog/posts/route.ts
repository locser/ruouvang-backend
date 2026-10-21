import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { BLOG_MODULE } from "../../../../modules/blog"
import type BlogModuleService from "../../../../modules/blog/service"

/**
 * GET /store/blog/posts
 * Danh sách bài ĐÃ ĐĂNG, đã bản-địa-hoá theo locale đang xem.
 * Lọc tuỳ chọn: ?category=<slug> · ?tag=<slug> · ?limit= · ?offset=
 *
 * • /store BẮT BUỘC có x-publishable-api-key (SDK storefront tự gắn).
 * • req.locale có sẵn (?locale → x-medusa-locale → mặc định của Store).
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const service: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  const q = req.query
  const locale = (req as MedusaRequest & { locale?: string }).locale

  const limit = q.limit ? parseInt(String(q.limit), 10) : 12
  const offset = q.offset ? parseInt(String(q.offset), 10) : 0

  const { posts, count } = await service.listPublishedPosts({
    locale: locale || "",
    categorySlug: q.category ? String(q.category) : null,
    tagSlug: q.tag ? String(q.tag) : null,
    limit: Number.isFinite(limit) ? limit : 12,
    offset: Number.isFinite(offset) ? offset : 0,
  })

  res.json({ posts, count, locale: locale ?? null })
}
