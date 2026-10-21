import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Báo cáo doanh thu 7 ngày, chạy 18:00 (giờ VN) hằng ngày -> đẩy vào ai_outbox,
 * Daemon định dạng Markdown và gửi Telegram cho Admin.
 */
export default async function revenueReportJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const pg = container.resolve("__pg_connection__");
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const days = 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "total", "currency_code", "created_at", "payment_status", "items.title", "items.quantity"],
      filters: { created_at: { $gte: since } } as any,
    });
    const list: any[] = orders || [];
    const paid = list.filter((o) =>
      ["captured", "partially_captured", "partially_refunded", "refunded"].includes(o.payment_status)
    );
    const revenueAll = list.reduce((s, o) => s + Number(o.total || 0), 0);
    const revenuePaid = paid.reduce((s, o) => s + Number(o.total || 0), 0);

    const productQty: Record<string, number> = {};
    for (const o of list) {
      for (const it of o.items || []) {
        const name = it.title || "(không tên)";
        productQty[name] = (productQty[name] || 0) + Number(it.quantity || 0);
      }
    }
    const topProducts = Object.entries(productQty)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => ({ name, qty }));

    const currency = list[0]?.currency_code?.toUpperCase() || "VND";
    await pg.raw(
      "INSERT INTO ai_outbox (loai, tham_chieu, du_lieu, trang_thai) VALUES (?, ?, ?, ?)",
      [
        "bao_cao_doanh_thu",
        `revenue-${new Date().toISOString().slice(0, 10)}`,
        JSON.stringify({
          period_days: days,
          order_count: list.length,
          paid_order_count: paid.length,
          revenue_all: revenueAll,
          revenue_paid: revenuePaid,
          currency,
          top_products: topProducts,
        }),
        "CHO",
      ]
    );
    logger.info(`[revenue-report] Đã đẩy báo cáo ${days} ngày (${list.length} đơn).`);
  } catch (e: any) {
    logger.warn(`[revenue-report] Lỗi tổng hợp doanh thu: ${e.message}`);
  }
}

export const config = {
  name: "ai-revenue-report",
  schedule: "0 11 * * *", // 11:00 UTC = 18:00 giờ VN
};
