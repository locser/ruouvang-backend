import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { checkAuth } from "../../../lib/ai-auth";
import { hoanThanhDon } from "../../../lib/hoan-thanh-don";

/**
 * AI OPERATOR 2.0 — Duyệt Giao & Hoàn Thành đơn hàng (1-Tap Settlement).
 *
 * POST /ai/order-complete
 * Body: { order_id: string, tracking_code?: string }
 *
 * Logic nằm ở `src/lib/hoan-thanh-don.ts`, dùng chung với route admin
 * `/admin/don-hang/:id/hoan-thanh` cho nhân viên. Route này chỉ kiểm tra khóa AI.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized: Invalid or missing x-ai-secret-key header" });
  }

  const { order_id, tracking_code } = (req.body ?? {}) as {
    order_id?: string;
    tracking_code?: string;
  };

  if (!order_id || typeof order_id !== "string") {
    return res.status(400).json({ error: "Thiếu order_id" });
  }

  const { status, body } = await hoanThanhDon(req, order_id, tracking_code);
  return res.status(status).json(body);
}
