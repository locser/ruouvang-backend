import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { BLOG_MODULE } from "../../../../../modules/blog"
import type BlogModuleService from "../../../../../modules/blog/service"
import type { PostAdminUpdateBlogCategoryType } from "../../validators"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const service: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  const category = await service.retrieveBlogCategory(req.params.id)
  res.json({ category })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminUpdateBlogCategoryType>,
  res: MedusaResponse
) => {
  const service: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  await service.updateBlogCategories([
    { id: req.params.id, ...req.validatedBody },
  ])
  const category = await service.retrieveBlogCategory(req.params.id)
  res.json({ category })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const service: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  await service.deleteBlogCategories(req.params.id)
  res.json({ id: req.params.id, object: "blog_category", deleted: true })
}
