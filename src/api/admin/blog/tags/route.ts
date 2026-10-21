import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { BLOG_MODULE } from "../../../../modules/blog"
import type BlogModuleService from "../../../../modules/blog/service"
import type { PostAdminCreateBlogTagType } from "../validators"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const service: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  const [tags, count] = await service.listAndCountBlogTags({})
  res.json({ tags, count })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminCreateBlogTagType>,
  res: MedusaResponse
) => {
  const service: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  const body = req.validatedBody
  const [tag] = await service.createBlogTags([
    { slug: body.slug, name: body.name ?? null },
  ])
  res.status(201).json({ tag })
}
