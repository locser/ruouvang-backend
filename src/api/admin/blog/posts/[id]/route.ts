import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { BLOG_MODULE } from "../../../../../modules/blog"
import type BlogModuleService from "../../../../../modules/blog/service"
import type { PostAdminUpdateBlogPostType } from "../../validators"

/** GET /admin/blog/posts/:id — lấy bài thô (đủ mọi locale) để sửa. */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const service: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  const post = await service.retrieveBlogPost(req.params.id)
  res.json({ post })
}

/** POST /admin/blog/posts/:id — cập nhật. Chỉ đụng trường được gửi. */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminUpdateBlogPostType>,
  res: MedusaResponse
) => {
  const service: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  const body = req.validatedBody

  const patch: Record<string, any> = { id: req.params.id, ...body }
  if (body.published_at !== undefined) {
    patch.published_at = body.published_at ? new Date(body.published_at) : null
  }

  await service.updateBlogPosts([patch])
  const post = await service.retrieveBlogPost(req.params.id)
  res.json({ post })
}

/** DELETE /admin/blog/posts/:id */
export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const service: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  await service.deleteBlogPosts(req.params.id)
  res.json({ id: req.params.id, object: "blog_post", deleted: true })
}
