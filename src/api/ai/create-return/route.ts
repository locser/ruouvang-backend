import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { createAndCompleteReturnOrderWorkflow } from "@medusajs/medusa/core-flows";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { checkAuth } from "../../../lib/ai-auth";

/**
 * Tạo yêu cầu đổi/trả hàng (doi_tra_hang) — createAndCompleteReturnOrderWorkflow.
 * items[].id = ID dòng hàng trong đơn (order line item, dạng orli_...).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized: Invalid x-ai-secret-key header" });
  }
  const { orderId, items, refundAmount, note, locationId } = req.body as {
    orderId: string;
    items: { id: string; quantity: number; reason_id?: string; note?: string }[];
    refundAmount?: number;
    note?: string;
    locationId?: string;
  };
  if (!orderId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Thiếu orderId hoặc danh sách items (order line item id + quantity)." });
  }

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  try {
    const { result } = await createAndCompleteReturnOrderWorkflow(req.scope).run({
      input: {
        order_id: orderId,
        items: items.map((i) => ({
          id: i.id,
          quantity: i.quantity,
          reason_id: i.reason_id,
          note: i.note,
        })),
        refund_amount: refundAmount,
        note,
        location_id: locationId,
      } as any,
    });
    return res.status(200).json({ ok: true, message: `Đã tạo yêu cầu đổi/trả cho đơn ${orderId}.`, result });
  } catch (err: any) {
    logger.error(`create-return lỗi: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
}
