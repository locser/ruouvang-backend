import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { checkAuth } from "../../../lib/ai-auth";

/**
 * Lịch sử mua của khách (phục vụ tư vấn cá nhân hóa - tu_van_san_pham).
 * GET /ai/customer-history?email=...  (ưu tiên email; phone là best-effort).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized: Invalid x-ai-secret-key header" });
  }
  const email = (req.query as any).email as string | undefined;
  const phone = (req.query as any).phone as string | undefined;
  if (!email && !phone) {
    return res.status(400).json({ error: "Cần email hoặc phone" });
  }

  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const filters: any = {};
    if (email) filters.email = email;

    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "created_at",
        "total",
        "currency_code",
        "items.title",
        "items.quantity",
        "shipping_address.phone",
      ],
      filters,
      pagination: { take: 50, order: { created_at: "DESC" } } as any,
    });

    let list: any[] = orders || [];
    if (phone && !email) {
      list = list.filter((o) => o.shipping_address?.phone === phone);
    }

    const boughtProducts: Record<string, number> = {};
    for (const o of list) {
      for (const it of o.items || []) {
        const name = it.title || "(không tên)";
        boughtProducts[name] = (boughtProducts[name] || 0) + Number(it.quantity || 0);
      }
    }

    return res.status(200).json({
      ok: true,
      order_count: list.length,
      products: Object.entries(boughtProducts).map(([name, qty]) => ({ name, qty })),
      recent_orders: list.slice(0, 5).map((o) => ({
        display_id: o.display_id,
        created_at: o.created_at,
        total: o.total,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
