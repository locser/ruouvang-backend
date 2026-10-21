import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { cancelOrderWorkflow, refundPaymentWorkflow } from "@medusajs/medusa/core-flows";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { checkAuth } from "../../../lib/ai-auth";

/**
 * Hủy đơn + hoàn tiền (huy_hoan_tien).
 * - Mặc định: cancelOrderWorkflow (tự hoàn phần đã thu, tự huỷ phần chưa thu).
 *   Workflow sẽ NÉM LỖI nếu đơn đã có fulfillment chưa huỷ (tức đã/đang giao) -> đúng logic "chỉ hủy khi chưa giao".
 * - partial=true + refundAmount: chỉ hoàn 1 phần tiền, KHÔNG hủy đơn (refundPaymentWorkflow).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized: Invalid x-ai-secret-key header" });
  }
  const { orderId, reason, refundAmount, partial } = req.body as {
    orderId: string;
    reason?: string;
    refundAmount?: number;
    partial?: boolean;
  };
  if (!orderId) return res.status(400).json({ error: "Thiếu orderId" });

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  try {
    if (partial === true && refundAmount && Number(refundAmount) > 0) {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
      const { data } = await query.graph({
        entity: "order",
        fields: [
          "id",
          "payment_collections.payments.id",
          "payment_collections.payments.amount",
        ],
        filters: { id: orderId },
      });
      const payment = (data?.[0]?.payment_collections || [])
        .flatMap((pc: any) => pc.payments || [])
        .find((p: any) => p?.id);
      if (!payment) {
        return res.status(404).json({ error: "Không tìm thấy khoản thanh toán của đơn để hoàn." });
      }
      await refundPaymentWorkflow(req.scope).run({
        input: { payment_id: payment.id, amount: Number(refundAmount), note: reason },
      });
      return res.status(200).json({
        ok: true,
        mode: "partial_refund",
        message: `Đã hoàn ${refundAmount}đ cho đơn ${orderId}.`,
      });
    }

    await cancelOrderWorkflow(req.scope).run({ input: { order_id: orderId } });
    return res.status(200).json({
      ok: true,
      mode: "cancel_refund",
      message: `Đã hủy đơn ${orderId} và hoàn tiền phần đã thu.`,
    });
  } catch (err: any) {
    logger.error(`refund-order lỗi: ${err.message}`);
    return res.status(500).json({
      error: err.message,
      goi_y: "Nếu đơn đã/đang giao (có fulfillment) thì không thể tự hủy — cần xử lý đổi trả (create-return).",
    });
  }
}
