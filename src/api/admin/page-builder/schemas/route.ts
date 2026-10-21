import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { SECTION_SCHEMAS } from "../../../../modules/page_builder/section-schemas"

/**
 * GET /admin/page-builder/schemas
 *
 * Trả về lược đồ của mọi loại khối. Admin dùng nó để TỰ SINH FORM.
 *
 * Đây là lý do thêm một khối mới KHÔNG cần viết thêm giao diện admin:
 *  1. Thêm mục vào SECTION_SCHEMAS
 *  2. Viết component ở storefront
 *  → Admin tự biết vẽ ô nhập nào, nhãn gì, mặc định ra sao.
 *
 * AI cũng đọc chính endpoint này để biết nó được phép sửa những gì.
 */
export const GET = async (
  _req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  res.json({ section_schemas: SECTION_SCHEMAS, count: SECTION_SCHEMAS.length })
}
