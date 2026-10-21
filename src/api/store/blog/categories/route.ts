import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { BLOG_MODULE } from "../../../../modules/blog"
import type BlogModuleService from "../../../../modules/blog/service"

/**
 * GET /store/blog/categories
 * Danh mục blog cho bộ lọc storefront, bản-địa-hoá theo locale đang xem.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const service: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  const locale = (req as MedusaRequest & { locale?: string }).locale
  const categories = await service.listPublicCategories(locale || "")
  res.json({ categories })
}
