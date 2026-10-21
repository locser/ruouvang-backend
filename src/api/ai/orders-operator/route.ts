import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { OrderStatus } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { checkAuth } from "../../../lib/ai-auth";

/**
 * AI OPERATOR 2.0 — Danh sách đơn hàng cho Mini App.
 *
 * GET /ai/orders-operator?status=pending|completed&limit=20&q=<sđt hoặc mã đơn>
 *
 * Trả về đúng những trường Mini App cần hiển thị trên màn hình điện thoại:
 * người nhận, số điện thoại, địa chỉ, các món, tổng tiền.
 *
 * Lưu ý về "pending": Medusa v2 dùng `order.status` với các giá trị
 * pending / completed / canceled / draft / archived / requires_action.
 * Đơn do AI chốt được tạo ở trạng thái `pending` và chờ chủ shop duyệt.
 */

const TRANG_THAI_HOP_LE = new Set<OrderStatus>(["pending", "completed", "canceled"]);

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized: Invalid or missing x-ai-secret-key header" });
  }

  const q = req.query as Record<string, string | undefined>;
  const trangThaiYeuCau = String(q.status) as OrderStatus;
  const status: OrderStatus = TRANG_THAI_HOP_LE.has(trangThaiYeuCau) ? trangThaiYeuCau : "pending";
  const limit = Math.min(Math.max(1, Number(q.limit) || 20), 50);
  const timKiem = (q.q ?? "").trim().toLowerCase();

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  try {
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id", "display_id", "status", "created_at", "total", "currency_code", "email", "metadata",
        "items.id", "items.title", "items.quantity", "items.unit_price",
        "shipping_address.first_name", "shipping_address.last_name",
        "shipping_address.phone", "shipping_address.address_1",
        "shipping_address.city", "shipping_address.province",
      ],
      filters: { status },
      pagination: { take: limit, skip: 0, order: { created_at: "DESC" } },
    });

    let ds = (orders ?? []) as any[];

    // Lọc theo SĐT hoặc mã đơn — làm phía server để Mini App nhẹ.
    if (timKiem) {
      ds = ds.filter((o) => {
        const sdt = String(o.shipping_address?.phone ?? "").toLowerCase();
        const ma = String(o.display_id ?? "").toLowerCase();
        const id = String(o.id ?? "").toLowerCase();
        return sdt.includes(timKiem) || ma.includes(timKiem) || id.includes(timKiem);
      });
    }

    const ketQua = ds.map((o) => {
      const a = o.shipping_address ?? {};
      const hoTen = [a.first_name, a.last_name].filter(Boolean).join(" ").trim();
      return {
        id: o.id,
        display_id: o.display_id,
        status: o.status,
        created_at: o.created_at,
        total_vnd: Number(o.total) || 0,
        currency_code: o.currency_code,
        tracking_code: o.metadata?.tracking_code ?? null,
        customer: {
          name: hoTen || o.email || "Khách lẻ",
          phone: a.phone ?? null,
          address: [a.address_1, a.city, a.province].filter(Boolean).join(", ") || null,
        },
        items: (o.items ?? []).map((it: any) => ({
          title: it.title,
          quantity: Number(it.quantity) || 0,
          unit_price_vnd: Number(it.unit_price) || 0,
        })),
      };
    });

    return res.status(200).json({ ok: true, status, count: ketQua.length, orders: ketQua });
  } catch (err: any) {
    logger.error(`[orders-operator] ${err?.message ?? err}`);
    return res.status(500).json({ error: "Không đọc được danh sách đơn hàng" });
  }
}
