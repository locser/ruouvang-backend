import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { PAGE_BUILDER_MODULE } from "../../../../../../modules/page_builder"
import type PageBuilderModuleService from "../../../../../../modules/page_builder/service"
import type { PostAdminReorderSectionsType } from "../../../validators"

/**
 * POST /admin/page-builder/templates/:id/reorder
 * SẮP XẾP LẠI THỨ TỰ KHỐI.
 *
 * Body: { section_ids: ["sec_2", "sec_1", "sec_3"] }  ← thứ tự mong muốn
 *
 * Phải gửi ĐỦ id của mọi khối trên trang. Gửi thiếu → 400, không âm thầm
 * bỏ sót khối nào (gửi thiếu thường là dấu hiệu giao diện đang dùng dữ
 * liệu cũ — chấp nhận nó sẽ làm lệch thứ tự một cách khó lần ra).
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminReorderSectionsType>,
  res: MedusaResponse
) => {
  const service: PageBuilderModuleService = req.scope.resolve(PAGE_BUILDER_MODULE)

  const result = await service.reorderSections(
    req.params.id,
    req.validatedBody.section_ids
  )

  if ("error" in result && result.error) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, result.error)
  }

  const page_template = await service.getPageForAdmin(req.params.id)

  res.json({ page_template })
}
