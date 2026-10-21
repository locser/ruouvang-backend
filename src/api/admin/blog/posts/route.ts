import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { BLOG_MODULE } from "../../../../modules/blog"
import type BlogModuleService from "../../../../modules/blog/service"
import type { PostAdminCreateBlogPostType } from "../validators"

/**
 * GET /admin/blog/posts — danh sách bài (mọi trạng thái), mới nhất trước.
 * Route /admin/* mặc định đã yêu cầu đăng nhập admin.
 */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const service: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  const [posts, count] = await service.listAndCountBlogPosts({})
  posts.sort(
    (a: any, b: any) =>
      new Date(b.created_at ?? 0).getTime() -
      new Date(a.created_at ?? 0).getTime()
  )
  res.json({ posts, count })
}

/**
 * POST /admin/blog/posts — tạo bài mới.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminCreateBlogPostType>,
  res: MedusaResponse
) => {
  const service: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  const body = req.validatedBody
  const status = body.status ?? "draft"
  const published_at = body.published_at
    ? new Date(body.published_at)
    : status === "published"
    ? new Date()
    : null

  const [post] = await (service.createBlogPosts as any)([
    {
      slug: body.slug,
      status,
      published_at,
      thumbnail: body.thumbnail ?? null,
      author_id: body.author_id ?? null,
      category_ids: body.category_ids ?? [],
      tag_ids: body.tag_ids ?? [],
      is_featured: body.is_featured ?? false,
      title: body.title ?? null,
      excerpt: body.excerpt ?? null,
      content: body.content ?? null,
      seo_title: body.seo_title ?? null,
      seo_description: body.seo_description ?? null,
    },
  ])

  res.status(201).json({ post })
}
