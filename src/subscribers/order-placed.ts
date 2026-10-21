import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { cauHinhSmtpTuCaiDat, guiEmailXacNhanDon } from "../lib/email-don-hang";
import { layCaiDat } from "../lib/lay-cai-dat";
import { nhanKenh, nhanThanhToan } from "../lib/nhan-don";

/**
 * Gửi mail xác nhận đúng một lần cho mỗi đơn: sau khi gửi được thì ghi dấu
 * `metadata.email_xac_nhan_luc` lên đơn, lần chạy lại thấy dấu thì bỏ qua.
 * Không bao giờ ném lỗi ra ngoài.
 */
async function guiXacNhanMotLan(order: any, container: any): Promise<void> {
  try {
    if (order.metadata?.email_xac_nhan_luc) return;

    const cd = await layCaiDat(container);
    const ketQua = await guiEmailXacNhanDon(order, {
      smtp: cauHinhSmtpTuCaiDat(cd),
      hotline: cd.hotline,
    });
    if (ketQua !== "da_gui") return;

    try {
      const orderModule: any = container.resolve(Modules.ORDER);
      await orderModule.updateOrders([
        {
          id: order.id,
          metadata: { ...(order.metadata ?? {}), email_xac_nhan_luc: new Date().toISOString() },
        },
      ]);
    } catch (e: any) {
      console.warn(`[email-don] đã gửi mail nhưng không ghi được dấu đã gửi: ${e?.message ?? e}`);
    }
  } catch (e: any) {
    console.warn(`[email-don] lỗi không mong đợi: ${e?.message ?? e}`);
  }
}

const fmt = (n: unknown) => `${Number(n || 0).toLocaleString("vi-VN")}đ`;
const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Báo đơn mới cho nhân viên qua Telegram (thông qua chatbot, nơi giữ bot của shop).
 * Nội dung HTML, kèm nút mở thẳng trang đơn trong Medusa admin.
 * Không bao giờ ném lỗi: Telegram hỏng không được làm hỏng việc chốt đơn.
 */
async function baoTelegramDonMoi(order: any): Promise<void> {
  try {
    const tenantId = process.env.CONFIG_TENANT_ID;
    const goc = process.env.CONFIG_API_CHATBOT_URL || "http://localhost:13000";
    const khoa = process.env.CONFIG_INTERNAL_SERVICE_KEY;
    if (!tenantId || !khoa) return;

    const addr = order.shipping_address || {};
    const ten = `${addr.first_name || ""} ${addr.last_name || ""}`.trim() || "Khách";
    const cachTra = nhanThanhToan(order.metadata);
    const kenh = nhanKenh(order.metadata);
    const luc = new Date(order.created_at || Date.now()).toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    });

    const dong = (order.items || []).map((i: any, k: number) => {
      const sl = Number(i.quantity || 0);
      const gia = Number(i.unit_price || 0);
      return `${k + 1}. ${esc(i.product_title || i.title)}\n    ${sl} × ${fmt(gia)} = <b>${fmt(gia * sl)}</b>`;
    });

    const giam = Number(order.discount_total || 0);
    const giao = order.shipping_methods?.[0]?.name;
    const tong = [
      `Tiền hàng: ${fmt(order.item_subtotal ?? order.subtotal)}`,
      giam > 0 ? `Giảm giá: -${fmt(giam)}` : null,
      `Phí giao hàng${giao ? ` (${esc(giao)})` : ""}: ${fmt(order.shipping_total)}`,
    ].filter(Boolean);

    const text = [
      `🛒 <b>ĐƠN MỚI CW${order.display_id}</b>  ·  ${esc(kenh)}  ·  ${luc}`,
      "",
      "<b>📦 Sản phẩm</b>",
      ...dong,
      "",
      "<b>💰 Thanh toán</b>",
      ...tong,
      `<b>TỔNG CỘNG: ${fmt(order.total)}</b>`,
      cachTra,
      "",
      "<b>👤 Khách hàng</b>",
      `${esc(ten)}${addr.phone ? ` · <code>${esc(addr.phone)}</code>` : ""}`,
      order.email && !String(order.email).endsWith("@khach.local") ? `✉️ ${esc(order.email)}` : null,
      `📍 ${esc([addr.address_1, addr.city].filter(Boolean).join(", "))}`,
      order.metadata?.ghi_chu ? `📝 ${esc(order.metadata.ghi_chu)}` : null,
    ]
      .filter((x) => x !== null)
      .join("\n");

    const adminGoc = (process.env.CONFIG_API_MEDUSA_ADMIN_URL || process.env.CONFIG_API_MEDUSA_URL || "http://localhost:9000").replace(/\/$/, "");
    const nut = { text: "🔎 Mở đơn trong admin", url: `${adminGoc}/app/orders/${order.id}` };

    const res = await fetch(`${goc}/v1/internal/order-notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ai-secret-key": khoa },
      body: JSON.stringify({ tenantId, text, nut }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.warn(`[telegram-don] chatbot trả ${res.status}`);
  } catch (e: any) {
    console.warn(`[telegram-don] không báo được: ${e?.message ?? e}`);
  }
}

/**
 * Khi có đơn mới (order.placed) -> đẩy tác vụ 'chot_don' vào ai_outbox cho AI Daemon xử lý.
 * Kèm sẵn thông tin giao hàng để adapter vận chuyển (GHN/GHTK) tạo vận đơn thật.
 */
export default async function orderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data.id;
  const pgConnection = container.resolve("__pg_connection__");
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "custom_display_id",
      "email",
      "total",
      "subtotal",
      "item_subtotal",
      "discount_total",
      "shipping_total",
      "created_at",
      "shipping_methods.name",
      "currency_code",
      "metadata",
      "items.*",
      "shipping_address.*",
    ],
    filters: { id: orderId },
  });
  if (!orders || orders.length === 0) return;
  const order: any = orders[0];

  // Email xác nhận cho khách. Đặt TRƯỚC đoạn kiểm tra trùng ai_outbox bên dưới
  // (đoạn đó có `return` sớm) và tách lỗi riêng: mail hỏng không được làm hỏng
  // việc tạo tác vụ chốt đơn.
  await guiXacNhanMotLan(order, container);
  await baoTelegramDonMoi(order);

  // Tránh chèn trùng tác vụ chốt đơn cho cùng 1 đơn
  const existing = await pgConnection.raw(
    "SELECT id FROM ai_outbox WHERE loai = 'chot_don' AND tham_chieu = ?",
    [order.id]
  );
  if (existing.rows.length > 0) return;

  const addr = order.shipping_address || {};
  const meta = addr.metadata || {};
  const toName = `${addr.first_name || ""} ${addr.last_name || ""}`.trim();

  const carrier = (await layCaiDat(container)).shipping_provider || "ghn";

  for (const item of order.items || []) {
    const sku = item.variant_sku || item.sku;
    if (!sku) continue;
    await pgConnection.raw(
      "INSERT INTO ai_outbox (loai, tham_chieu, du_lieu, trang_thai) VALUES (?, ?, ?, ?)",
      [
        "chot_don",
        order.id,
        JSON.stringify({
          sku,
          quantity: item.quantity,
          lineItemId: item.id,
          productName: item.title,
          carrier,
          toName,
          toPhone: addr.phone || "",
          toAddress: addr.address_1 || "",
          toProvinceName: addr.province || "",
          toDistrictName: addr.city || "",
          toWardName: meta.ward_name || "",
          toDistrictId: meta.district_id ?? meta.to_district_id,
          toWardCode: meta.ward_code ?? meta.to_ward_code,
        }),
        "CHO",
      ]
    );
  }
}

export const config: SubscriberConfig = { event: "order.placed" };
