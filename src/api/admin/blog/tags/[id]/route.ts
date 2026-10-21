import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { BLOG_MODULE } from "../../../../../modules/blog"
import type BlogModuleService from "../../../../../modules/blog/service"
import type { PostAdminUpdateBlogTagType } from "../../validators"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const service: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  const tag = await service.retrieveBlogTag(req.params.id)
  res.json({ tag })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminUpdateBlogTagType>,
  res: MedusaResponse
) => {
  const service: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  await service.updateBlogTags([{ id: req.params.id, ...req.validatedBody }])
  const tag = await service.retrieveBlogTag(req.params.id)
  res.json({ tag })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const service: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  await service.deleteBlogTags(req.params.id)
  res.json({ id: req.params.id, object: "blog_tag", deleted: true })
}
