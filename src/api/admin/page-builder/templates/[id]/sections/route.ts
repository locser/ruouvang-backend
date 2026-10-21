import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { PAGE_BUILDER_MODULE } from "../../../../../../modules/page_builder"
import type PageBuilderModuleService from "../../../../../../modules/page_builder/service"
import type { PostAdminAddSectionType } from "../../../validators"

/**
 * POST /admin/page-builder/templates/:id/sections
 * THÊM KHỐI vào trang. Settings lấy mặc định từ lược đồ của khối đó.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminAddSectionType>,
  res: MedusaResponse
) => {
  const service: PageBuilderModuleService = req.scope.resolve(PAGE_BUILDER_MODULE)

  const result = await service.addSection(req.params.id, req.validatedBody.type)

  if ("error" in result && result.error) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, result.error)
  }

  res.status(201).json({ page_section: result.section })
}
