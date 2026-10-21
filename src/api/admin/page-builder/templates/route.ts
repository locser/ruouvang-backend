import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { PAGE_BUILDER_MODULE } from "../../../../modules/page_builder"
import type PageBuilderModuleService from "../../../../modules/page_builder/service"
import type { PostAdminCreatePageTemplateType } from "../validators"

/**
 * GET /admin/page-builder/templates
 * Danh sách mọi mẫu trang.
 *
 * Route /admin/* MẶC ĐỊNH đã yêu cầu đăng nhập admin — không phải tự thêm.
 */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const service: PageBuilderModuleService = req.scope.resolve(PAGE_BUILDER_MODULE)

  const [page_templates, count] = await service.listAndCountPageTemplates()

  res.json({ page_templates, count })
}

/**
 * POST /admin/page-builder/templates
 * Tạo mẫu trang mới.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminCreatePageTemplateType>,
  res: MedusaResponse
) => {
  const service: PageBuilderModuleService = req.scope.resolve(PAGE_BUILDER_MODULE)

  const [page_template] = await service.createPageTemplates([
    {
      handle: req.validatedBody.handle,
      title: req.validatedBody.title,
      status: req.validatedBody.status ?? "draft",
    },
  ])

  res.status(201).json({ page_template })
}
