import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { BLOG_MODULE } from "../../../../../modules/blog"
import type BlogModuleService from "../../../../../modules/blog/service"
import type { PostAdminUpdateBlogAuthorType } from "../../validators"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const service: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  const author = await service.retrieveBlogAuthor(req.params.id)
  res.json({ author })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminUpdateBlogAuthorType>,
  res: MedusaResponse
) => {
  const service: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  await service.updateBlogAuthors([{ id: req.params.id, ...req.validatedBody }])
  const author = await service.retrieveBlogAuthor(req.params.id)
  res.json({ author })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const service: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  await service.deleteBlogAuthors(req.params.id)
  res.json({ id: req.params.id, object: "blog_author", deleted: true })
}
