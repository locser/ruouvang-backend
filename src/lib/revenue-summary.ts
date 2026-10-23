/**
 * Tổng hợp doanh thu dùng chung cho GET /ai/report/revenue và job revenue-report.
 *
 * - Loại đơn "canceled" khỏi mọi số liệu, chỉ đếm ở `canceled_count`.
 * - "Đã thu": metadata.thanh_toan_trang_thai = da_thanh_toan, hoặc COD và status completed.
 *   (`payment_status` không có khi dùng query.graph ở Medusa 2.17.)
 */

/** Đơn đã thu tiền: nhãn da_thanh_toan, hoặc COD và đã hoàn thành (giao + thu khi giao). */
export function daThuTien(o: any): boolean {
  const md = o?.metadata ?? {};
  if (md.thanh_toan_trang_thai === "da_thanh_toan") return true;
  const cod = md.thanh_toan_trang_thai === "cod" || md.phuong_thuc_thanh_toan === "cod";
  return cod && o.status === "completed";
}

export interface RevenueSummary {
  timezone: "Asia/Ho_Chi_Minh";
  excludes_canceled: true;
  order_count: number;
  paid_order_count: number;
  revenue_all: number;
  revenue_paid: number;
  avg_order_value: number;
  currency: string;
  top_products: { name: string; qty: number }[];
  canceled_count: number;
  pending_count: number;
  revenue_pending: number;
}

/** `to` bỏ trống thì chỉ lọc created_at >= from. */
export async function summarizeRevenue(
  query: { graph: (args: any) => Promise<{ data: any[] }> },
  range: { from: string; to?: string }
): Promise<RevenueSummary> {
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id", "display_id", "total", "currency_code", "created_at", "status", "metadata",
      // Medusa 2.17: chọn lẻ items.quantity trả rỗng; phải lấy items.*.
      "items.*",
    ],
    filters: { created_at: range.to ? { $gte: range.from, $lte: range.to } : { $gte: range.from } },
  });

  // Lọc huỷ trong bộ nhớ (cần đếm canceled_count nên vẫn phải tải đơn huỷ về).
  const all = orders || [];
  const canceledCount = all.filter((o: any) => o.status === "canceled").length;
  const list = all.filter((o: any) => o.status !== "canceled");
  const paid = list.filter(daThuTien);
  const pending = list.filter((o: any) => o.status === "pending");
  const sum = (xs: any[]) => xs.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
  const revenueAll = sum(list);

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

  return {
    timezone: "Asia/Ho_Chi_Minh",
    excludes_canceled: true,
    order_count: list.length,
    paid_order_count: paid.length,
    revenue_all: revenueAll,
    revenue_paid: sum(paid),
    avg_order_value: list.length ? Math.round(revenueAll / list.length) : 0,
    currency: list[0]?.currency_code?.toUpperCase() || "VND",
    top_products: topProducts,
    canceled_count: canceledCount,
    pending_count: pending.length,
    revenue_pending: sum(pending),
  };
}
