import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { BLOG_MODULE } from "../../../../modules/blog"
import type BlogModuleService from "../../../../modules/blog/service"
import type { PostAdminCreateBlogAuthorType } from "../validators"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const service: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  const [authors, count] = await service.listAndCountBlogAuthors({})
  res.json({ authors, count })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminCreateBlogAuthorType>,
  res: MedusaResponse
) => {
  const service: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  const body = req.validatedBody
  const [author] = await service.createBlogAuthors([
    {
      name: body.name,
      bio: body.bio ?? null,
      avatar: body.avatar ?? null,
    },
  ])
  res.status(201).json({ author })
}
