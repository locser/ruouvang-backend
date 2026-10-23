import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Quét tồn kho định kỳ; SKU khả dụng <= ngưỡng (low_stock_threshold) -> đẩy cảnh báo vào ai_outbox.
 * Daemon sẽ gửi cảnh báo Telegram. Chống spam: bỏ qua nếu đã cảnh báo trong 12 giờ gần đây.
 */
/**
 * Thêm `title` = "Sản phẩm - Biến thể"; bỏ biến thể khi nó bắt đầu bằng tên sản phẩm hoặc là/kết thúc bằng
 * "Default Title"/"Default". Ép các số lượng (SUM trả chuỗi) về Number; giữ nguyên các trường cũ.
 */
export function tenHienThi(r: any) {
  const { product_title, variant_title, ...rest } = r;
  const v = typeof variant_title === "string" ? variant_title.trim() : "";
  const p = typeof product_title === "string" ? product_title.trim() : "";
  const macDinh = /(^|\s)default( title)?$/i.test(v);
  const bo = !v || macDinh || (p && v.toLowerCase().startsWith(p.toLowerCase()));
  const parts = [p, bo ? "" : v].filter(Boolean);
  for (const k of ["stocked_quantity", "reserved_quantity", "available"]) {
    if (k in rest) (rest as any)[k] = Number((rest as any)[k]);
  }
  return { ...rest, title: parts.length ? parts.join(" - ") : (r.sku ?? null) };
}

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
    // Gộp inventory_level theo item TRONG SUBQUERY trước, rồi mới join variant/product
    // (join trước rồi SUM sẽ nhân đôi khi một item gắn nhiều variant).
    const low = await pg.raw(
      `SELECT ii.sku,
              p.title AS product_title,
              pv.title AS variant_title,
              lv.stocked_quantity,
              lv.reserved_quantity,
              lv.available
       FROM (
         SELECT il.inventory_item_id,
                SUM(il.stocked_quantity) AS stocked_quantity,
                SUM(COALESCE(il.reserved_quantity, 0)) AS reserved_quantity,
                SUM(il.stocked_quantity - COALESCE(il.reserved_quantity, 0)) AS available
         FROM inventory_level il
         WHERE il.deleted_at IS NULL
         GROUP BY il.inventory_item_id
         HAVING SUM(il.stocked_quantity - COALESCE(il.reserved_quantity, 0)) <= ?
       ) lv
       JOIN inventory_item ii ON ii.id = lv.inventory_item_id AND ii.deleted_at IS NULL
       LEFT JOIN product_variant_inventory_item pvii ON pvii.inventory_item_id = ii.id AND pvii.deleted_at IS NULL
       LEFT JOIN product_variant pv ON pv.id = pvii.variant_id AND pv.deleted_at IS NULL
       LEFT JOIN product p ON p.id = pv.product_id AND p.deleted_at IS NULL
       ORDER BY lv.available ASC
       LIMIT 50`,
      [threshold]
    );
    rows = (low.rows || []).map(tenHienThi);
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
