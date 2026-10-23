import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { checkAuth } from "../../../../lib/ai-auth";
import { REPORT_PERIODS, ReportPeriod, periodRange } from "../../../../lib/report-period";

/** Đơn đã thu tiền: nhãn da_thanh_toan, hoặc COD và đã hoàn thành (giao + thu khi giao). */
function daThuTien(o: any): boolean {
  const md = o?.metadata ?? {};
  if (md.thanh_toan_trang_thai === "da_thanh_toan") return true;
  const cod = md.thanh_toan_trang_thai === "cod" || md.phuong_thuc_thanh_toan === "cod";
  return cod && o.status === "completed";
}

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
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "total",
        "currency_code",
        "created_at",
        "status",
        "metadata",
        // Medusa 2.17: chọn lẻ items.quantity trả rỗng; phải lấy items.*.
        "items.*",
      ],
      filters: { created_at: range ? { $gte: range.from, $lte: range.to } : { $gte: since } } as any,
    });

    // Lọc huỷ trong bộ nhớ (cần đếm canceled_count nên vẫn phải tải đơn huỷ về).
    const all = orders || [];
    const canceledCount = all.filter((o: any) => o.status === "canceled").length;
    const list = all.filter((o: any) => o.status !== "canceled");
    // `payment_status` không có khi dùng query.graph (Medusa 2.17), nên dùng metadata:
    // đã thu = nhãn da_thanh_toan, hoặc COD đã giao xong (status completed).
    const paid = list.filter((o: any) => daThuTien(o));
    const pending = list.filter((o: any) => o.status === "pending");
    const revenuePending = pending.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
    const revenueAll = list.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
    const revenuePaid = paid.reduce((s: number, o: any) => s + Number(o.total || 0), 0);

    // Top sản phẩm theo số lượng
    const productQty: Record<string, number> = {};
    for (const o of list) {
      for (const it of (o as any).items || []) {
        const name = it.title || "(không tên)";
        productQty[name] = (productQty[name] || 0) + Number(it.quantity || 0);
      }
    }
    const topProducts = Object.entries(productQty)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => ({ name, qty }));

    const currency = (list[0] as any)?.currency_code?.toUpperCase() || "VND";
    return res.status(200).json({
      ok: true,
      period_days: period ? null : days,
      ...(period ? { period, from: range!.from, to: range!.to } : {}),
      since,
      timezone: "Asia/Ho_Chi_Minh",
      excludes_canceled: true,
      canceled_count: canceledCount,
      pending_count: pending.length,
      revenue_pending: revenuePending,
      order_count: list.length,
      paid_order_count: paid.length,
      revenue_all: revenueAll,
      revenue_paid: revenuePaid,
      avg_order_value: list.length ? Math.round(revenueAll / list.length) : 0,
      currency,
      top_products: topProducts,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
