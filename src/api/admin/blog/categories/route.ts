import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { BLOG_MODULE } from "../../../../modules/blog"
import type BlogModuleService from "../../../../modules/blog/service"
import type { PostAdminCreateBlogCategoryType } from "../validators"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const service: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  const [categories, count] = await service.listAndCountBlogCategories({})
  categories.sort((a: any, b: any) => (a.rank ?? 0) - (b.rank ?? 0))
  res.json({ categories, count })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminCreateBlogCategoryType>,
  res: MedusaResponse
) => {
  const service: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  const body = req.validatedBody
  const [category] = await service.createBlogCategories([
    {
      slug: body.slug,
      name: body.name ?? null,
      description: body.description ?? null,
      rank: body.rank ?? 0,
    },
  ])
  res.status(201).json({ category })
}
