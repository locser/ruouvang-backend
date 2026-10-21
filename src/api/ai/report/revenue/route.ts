import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { checkAuth } from "../../../../lib/ai-auth";

/**
 * Báo cáo doanh thu (bao_cao_doanh_thu) — dùng query.graph để lấy total (computed) chuẩn.
 * GET /ai/report/revenue?days=7
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized: Invalid x-ai-secret-key header" });
  }
  const days = Math.max(1, Math.min(365, Number((req.query as any).days) || 7));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

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
        "payment_status",
        "items.title",
        "items.quantity",
      ],
      filters: { created_at: { $gte: since } } as any,
    });

    const list = orders || [];
    const paid = list.filter((o: any) =>
      ["captured", "partially_captured", "partially_refunded", "refunded"].includes(o.payment_status)
    );
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
      period_days: days,
      since,
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
