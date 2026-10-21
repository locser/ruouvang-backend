import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Pool } from "pg";
import { checkAuth } from "../../../lib/ai-auth";

const pgPool = new Pool({
  connectionString: (() => {
    // Không nhúng mật khẩu DB vào mã nguồn. Thiếu biến = dừng, không đoán.
    const v = process.env.CONFIG_POSTGRES_URL_MEDUSA;
    if (!v) throw new Error("Thiếu CONFIG_POSTGRES_URL_MEDUSA");
    return v;
  })(),
});

/**
 * Danh mục sản phẩm đã publish kèm tồn kho thực tế — phục vụ chatbot tư vấn.
 * GET /ai/catalog?limit=200
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized: Invalid x-ai-secret-key header" });
  }
  const limit = Math.min(500, Number((req.query as any).limit) || 200);

  try {
    const dbRes = await pgPool.query(`
      SELECT 
          p.id, 
          p.title, 
          p.subtitle, 
          p.description,
          (SELECT name FROM product_category pc JOIN product_category_product pcp ON pc.id = pcp.product_category_id WHERE pcp.product_id = p.id LIMIT 1) as category,
          json_agg(json_build_object(
              'sku', pv.sku, 
              'available', COALESCE(il.stocked_quantity, 0) - COALESCE(il.reserved_quantity, 0)
          )) as variants
      FROM product p
      JOIN product_variant pv ON p.id = pv.product_id
      LEFT JOIN product_variant_inventory_item pvii ON pv.id = pvii.variant_id
      LEFT JOIN inventory_level il ON pvii.inventory_item_id = il.inventory_item_id
      WHERE p.status = 'published'
      GROUP BY p.id, p.title, p.subtitle, p.description
      ORDER BY p.title ASC
      LIMIT $1
    `, [limit]);

    const list = (dbRes.rows || []).map((p: any) => ({
      id: p.id,
      title: p.title,
      subtitle: p.subtitle || "",
      description: (p.description || "").slice(0, 240),
      category: p.category || "",
      variants: p.variants || [],
    }));

    return res.status(200).json({ ok: true, count: list.length, products: list });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
