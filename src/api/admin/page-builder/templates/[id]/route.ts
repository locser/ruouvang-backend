import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { PAGE_BUILDER_MODULE } from "../../../../../modules/page_builder"
import type PageBuilderModuleService from "../../../../../modules/page_builder/service"
import type { PostAdminUpdatePageTemplateType } from "../../validators"

/**
 * GET /admin/page-builder/templates/:id
 * Lấy trang kèm TẤT CẢ khối — gồm cả khối đang tắt (Admin cần thấy hết).
 */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const service: PageBuilderModuleService = req.scope.resolve(PAGE_BUILDER_MODULE)

  const page_template = await service.getPageForAdmin(req.params.id)

  res.json({ page_template })
}

/**
 * POST /admin/page-builder/templates/:id
 * Sửa tiêu đề / trạng thái publish.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminUpdatePageTemplateType>,
  res: MedusaResponse
) => {
  const service: PageBuilderModuleService = req.scope.resolve(PAGE_BUILDER_MODULE)

  await service.updatePageTemplates([
    { id: req.params.id, ...req.validatedBody },
  ])

  const page_template = await service.getPageForAdmin(req.params.id)

  res.json({ page_template })
}

/**
 * DELETE /admin/page-builder/templates/:id
 */
export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const service: PageBuilderModuleService = req.scope.resolve(PAGE_BUILDER_MODULE)

  // Dọn khối con trước để không bỏ lại dữ liệu mồ côi
  const sections = await service.listPageSections({
    template_id: req.params.id,
  })
  if (sections.length) {
    await service.deletePageSections(sections.map((s: any) => s.id))
  }

  await service.deletePageTemplates(req.params.id)

  res.json({ id: req.params.id, object: "page_template", deleted: true })
}
