import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { periodRange, vnDateString } from "../lib/report-period";
import { summarizeRevenue } from "../lib/revenue-summary";

/**
 * Báo cáo doanh thu trong ngày (từ 0h giờ VN tới lúc chạy), 18:00 giờ VN hằng ngày
 * -> đẩy vào ai_outbox (loai "bao_cao_doanh_thu", tham_chieu "revenue-<ngày VN>"),
 * chatbot kéo về qua /ai/outbox/claim và gửi Telegram cho Admin.
 * Logic tổng hợp dùng chung với GET /ai/report/revenue (src/lib/revenue-summary.ts).
 */
export default async function revenueReportJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const pg = container.resolve("__pg_connection__") as any;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  try {
    const now = new Date();
    const { from, to } = periodRange("today", now);
    const summary = await summarizeRevenue(query as any, { from, to });
    const thamChieu = `revenue-${vnDateString(now)}`;

    const trung = await pg.raw(
      "SELECT id FROM ai_outbox WHERE loai = 'bao_cao_doanh_thu' AND tham_chieu = ?",
      [thamChieu]
    );
    if ((trung?.rows?.length ?? 0) > 0) return;

    await pg.raw(
      "INSERT INTO ai_outbox (loai, tham_chieu, du_lieu, trang_thai) VALUES (?, ?, ?, ?)",
      [
        "bao_cao_doanh_thu",
        thamChieu,
        JSON.stringify({ period: "today", period_days: null, from, to, since: from, ...summary }),
        "CHO",
      ]
    );
    logger.info(`[revenue-report] Đã đẩy báo cáo hôm nay (${summary.order_count} đơn, ${summary.canceled_count} huỷ).`);
  } catch (e: any) {
    logger.warn(`[revenue-report] Lỗi tổng hợp doanh thu: ${e.message}`);
  }
}

export const config = {
  name: "ai-revenue-report",
  schedule: "0 11 * * *", // 11:00 UTC = 18:00 giờ VN
};
