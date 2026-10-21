import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Quét tồn kho định kỳ; SKU khả dụng <= ngưỡng (low_stock_threshold) -> đẩy cảnh báo vào ai_outbox.
 * Daemon sẽ gửi cảnh báo Telegram. Chống spam: bỏ qua nếu đã cảnh báo trong 12 giờ gần đây.
 */
export default async function stockAlertJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const pg = container.resolve("__pg_connection__");

  let threshold = 5;
  try {
    const r = await pg.raw("SELECT low_stock_threshold FROM ai_safety_limit WHERE id = 1");
    threshold = Number(r.rows?.[0]?.low_stock_threshold ?? 5);
  } catch {
    /* dùng mặc định */
  }

  let rows: any[] = [];
  try {
    const low = await pg.raw(
      `SELECT ii.sku,
              il.stocked_quantity,
              COALESCE(il.reserved_quantity, 0) AS reserved_quantity,
              (il.stocked_quantity - COALESCE(il.reserved_quantity, 0)) AS available
       FROM inventory_item ii
       JOIN inventory_level il ON ii.id = il.inventory_item_id
       WHERE (il.stocked_quantity - COALESCE(il.reserved_quantity, 0)) <= ?
       ORDER BY available ASC
       LIMIT 50`,
      [threshold]
    );
    rows = low.rows || [];
  } catch (e: any) {
    logger.warn(`[stock-alert] Không quét được tồn kho: ${e.message}`);
    return;
  }
  if (rows.length === 0) return;

  const recent = await pg.raw(
    "SELECT id FROM ai_outbox WHERE loai = 'canh_bao_het_hang' AND tao_luc > NOW() - INTERVAL '12 hours'"
  );
  if (recent.rows.length > 0) return;

  await pg.raw(
    "INSERT INTO ai_outbox (loai, tham_chieu, du_lieu, trang_thai) VALUES (?, ?, ?, ?)",
    [
      "canh_bao_het_hang",
      `stock-${new Date().toISOString().slice(0, 13)}`,
      JSON.stringify({ threshold, count: rows.length, items: rows.slice(0, 20) }),
      "CHO",
    ]
  );
  logger.info(`[stock-alert] ${rows.length} SKU <= ngưỡng ${threshold}. Đã đẩy cảnh báo.`);
}

export const config = {
  name: "ai-stock-alert",
  schedule: "0 */2 * * *", // mỗi 2 giờ
};
