import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { PAGE_BUILDER_MODULE } from "../../../../modules/page_builder"
import type PageBuilderModuleService from "../../../../modules/page_builder/service"

/**
 * GET /store/page-templates/:handle
 *
 * Storefront gọi để dựng trang. Chỉ trả:
 *  • trang đã publish
 *  • khối đang BẬT, đã sắp thứ tự
 *
 * Ghi chú về bảo mật & locale (đã kiểm chứng trên mã nguồn 2.16.0):
 *  • Toàn bộ /store BẮT BUỘC có header x-publishable-api-key — Medusa áp
 *    ở tầng router, custom route cũng không ngoại lệ.
 *  • /store cho phép khách vô danh (không đăng nhập) — đúng ý ở đây.
 *  • req.locale có sẵn (query ?locale= → header x-medusa-locale → mặc
 *    định của Store). KHÔNG phải tự cắm middleware locale.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const service: PageBuilderModuleService = req.scope.resolve(PAGE_BUILDER_MODULE)

  const page_template = await service.getPublishedPage(req.params.handle)

  if (!page_template) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Không tìm thấy trang đã publish với handle "${req.params.handle}"`
    )
  }

  res.json({
    page_template,
    // Trả lại locale đang dùng để storefront kiểm tra/gỡ lỗi khi cần.
    // Nội dung khối do người nhập nên CHƯA đi qua Translation Module —
    // xem ghi chú "đa ngôn ngữ nội dung khối" trong PAGE_BUILDER.md.
    locale: (req as MedusaRequest & { locale?: string }).locale ?? null,
  })
}
