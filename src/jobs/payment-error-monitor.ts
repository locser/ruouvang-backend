import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Giám sát lỗi thanh toán (canh_bao_loi_thanh_toan).
 * Medusa v2.17.2 KHÔNG phát event 'payment.failed', nên ta quét đơn 10 phút gần nhất:
 * đếm đơn bị huỷ trong cửa sổ (canceled_at) hoặc có payment collection canceled/failed. > 3 -> đẩy cảnh báo P0.
 * (Order không có `payment_status` khi dùng query.graph ở 2.17 nên không dùng.)
 * Chống spam: bỏ qua nếu đã cảnh báo trong 10 phút.
 */
export default async function paymentErrorMonitorJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const pg = container.resolve("__pg_connection__");
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  try {
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "display_id", "status", "canceled_at", "updated_at", "payment_collections.status"],
      filters: { updated_at: { $gte: since } } as any,
    });
    const sinceMs = new Date(since).getTime();
    const problems: { display_id: unknown; status: unknown; reason: "huy" | "thanh_toan_loi" }[] = [];
    for (const o of (orders || []) as any[]) {
      const huy = o.status === "canceled" && o.canceled_at && new Date(o.canceled_at).getTime() >= sinceMs;
      const ttLoi = (o.payment_collections ?? []).some((pc: any) => ["canceled", "failed"].includes(pc?.status));
      if (huy) problems.push({ display_id: o.display_id, status: o.status, reason: "huy" });
      else if (ttLoi) problems.push({ display_id: o.display_id, status: o.status, reason: "thanh_toan_loi" });
    }
    if (problems.length <= 3) return;

    const recent = await pg.raw(
      "SELECT id FROM ai_outbox WHERE loai = 'canh_bao_loi_thanh_toan' AND tao_luc > NOW() - INTERVAL '10 minutes'"
    );
    if (recent.rows.length > 0) return;

    await pg.raw(
      "INSERT INTO ai_outbox (loai, tham_chieu, du_lieu, trang_thai) VALUES (?, ?, ?, ?)",
      [
        "canh_bao_loi_thanh_toan",
        `payerr-${Date.now()}`,
        JSON.stringify({
          count: problems.length,
          window_minutes: 10,
          sample: problems.slice(0, 10),
        }),
        "CHO",
      ]
    );
    logger.warn(`[payment-error-monitor] ${problems.length} đơn lỗi/hủy trong 10 phút. Đã đẩy cảnh báo P0.`);
  } catch (e: any) {
    logger.warn(`[payment-error-monitor] Lỗi giám sát: ${e.message}`);
  }
}

export const config = {
  name: "ai-payment-error-monitor",
  schedule: "*/5 * * * *", // mỗi 5 phút
};
