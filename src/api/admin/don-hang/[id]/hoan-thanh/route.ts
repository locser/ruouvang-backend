import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { hoanThanhDon } from "../../../../../lib/hoan-thanh-don"

/**
 * POST /admin/don-hang/:id/hoan-thanh — nhân viên duyệt giao và hoàn thành đơn.
 *
 * Body (tùy chọn): { tracking_code?: string }
 *
 * Đăng nhập admin do Medusa kiểm tra. Logic dùng chung với `/ai/order-complete`
 * (xem `src/lib/hoan-thanh-don.ts`): thu tiền, tạo fulfillment, hoàn thành đơn,
 * chống bấm trùng qua `ai_action_log`.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<{ tracking_code?: string }>,
  res: MedusaResponse
) => {
  const tracking_code =
    typeof req.body?.tracking_code === "string" ? req.body.tracking_code : undefined

  const { status, body } = await hoanThanhDon(req, req.params.id, tracking_code)
  res.status(status).json(body)
}
