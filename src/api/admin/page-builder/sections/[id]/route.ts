import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { PAGE_BUILDER_MODULE } from "../../../../../modules/page_builder"
import type PageBuilderModuleService from "../../../../../modules/page_builder/service"
import type { PostAdminUpdateSectionType } from "../../validators"

/**
 * POST /admin/page-builder/sections/:id
 * BẬT/TẮT khối, hoặc ghi settings của khối.
 *
 * Body ví dụ:
 *   { "enabled": false }                          ← tắt khối, giữ nguyên dữ liệu
 *   { "settings": { "heading": "Xin chào", ... } } ← ghi TRỌN VẸN settings
 *
 * ⚠️ settings phải gửi TRỌN VẸN. Medusa merge trường json() chứ không
 *    thay thế — gửi từng phần sẽ để lại giá trị cũ lẫn vào. Validator đã
 *    đổi "" → null để tránh việc Medusa xoá hẳn khoá.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminUpdateSectionType>,
  res: MedusaResponse
) => {
  const service: PageBuilderModuleService = req.scope.resolve(PAGE_BUILDER_MODULE)

  if (typeof req.validatedBody.enabled === "boolean") {
    await service.toggleSection(req.params.id, req.validatedBody.enabled)
  }

  if (req.validatedBody.settings) {
    await service.setSectionSettings(req.params.id, req.validatedBody.settings)
  }

  const page_section = await service.retrievePageSection(req.params.id)

  res.json({ page_section })
}

/**
 * DELETE /admin/page-builder/sections/:id
 * Xoá hẳn khối. Muốn ẩn tạm thì dùng POST { enabled: false } — an toàn hơn.
 */
export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const service: PageBuilderModuleService = req.scope.resolve(PAGE_BUILDER_MODULE)

  await service.deletePageSections(req.params.id)

  res.json({ id: req.params.id, object: "page_section", deleted: true })
}
