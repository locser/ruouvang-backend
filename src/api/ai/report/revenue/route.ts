import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { checkAuth } from "../../../../lib/ai-auth";
import { summarizeRevenue } from "../../../../lib/revenue-summary";
import { REPORT_PERIODS, ReportPeriod, periodRange } from "../../../../lib/report-period";

/**
 * Báo cáo doanh thu (bao_cao_doanh_thu) — dùng query.graph để lấy total (computed) chuẩn.
 * GET /ai/report/revenue?days=7
 * GET /ai/report/revenue?period=today|this_week|this_month
 *
 * `period` (tuỳ chọn) tính theo giờ Asia/Ho_Chi_Minh từ 0h (tuần bắt đầu thứ Hai) đến
 * hiện tại; khi có thì thay cho `days`, response trả `period`, `from`, `to` và
 * `period_days: null`. Không truyền thì như cũ theo `days`.
 * Đơn status "canceled" bị loại khỏi mọi số liệu (response có `excludes_canceled: true`)
 * và chỉ được đếm ở `canceled_count`. `paid_*` theo metadata (xem daThuTien); `pending_*` là đơn status pending.
 * `since` giữ nguyên để tương thích (= `from` khi dùng period).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized: Invalid x-ai-secret-key header" });
  }
  const q = req.query as any;
  const days = Math.max(1, Math.min(365, Number(q.days) || 7));
  const periodRaw = q.period;
  if (periodRaw !== undefined && periodRaw !== "" && !REPORT_PERIODS.includes(String(periodRaw))) {
    return res.status(400).json({ error: "period chỉ nhận today, this_week hoặc this_month", code: "invalid_period" });
  }
  const period = periodRaw ? (String(periodRaw) as ReportPeriod) : null;
  const range = period ? periodRange(period) : null;
  const since = range ? range.from : new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const summary = await summarizeRevenue(query as any, range ? { from: range.from, to: range.to } : { from: since });
    return res.status(200).json({
      ok: true,
      period_days: period ? null : days,
      ...(period ? { period, from: range!.from, to: range!.to } : {}),
      since,
      ...summary,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
