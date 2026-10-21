import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { BLOG_MODULE } from "../../../../../modules/blog"
import type BlogModuleService from "../../../../../modules/blog/service"

/**
 * GET /store/blog/posts/:slug
 * Chi tiết một bài đã đăng (kèm nội dung, tác giả, danh mục, thẻ, bài liên quan),
 * bản-địa-hoá theo locale đang xem.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const service: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  const locale = (req as MedusaRequest & { locale?: string }).locale

  const post = await service.getPublishedPostBySlug(
    req.params.slug,
    locale || ""
  )

  if (!post) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Không tìm thấy bài viết đã đăng với slug "${req.params.slug}"`
    )
  }

  res.json({ post, locale: locale ?? null })
}
