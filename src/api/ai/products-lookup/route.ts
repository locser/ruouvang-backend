import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Pool } from "pg";
import { checkAuth } from "../../../lib/ai-auth";

/**
 * Tra cứu GIÁ và TỒN KHO THẬT theo lô ID hoặc SKU.
 *
 * Vì sao cần endpoint này (thay vì dùng /ai/catalog):
 *  - /ai/catalog trần 500 sản phẩm và KHÔNG trả giá → không dùng được ở quy mô
 *    60.000 SKU, và không phục vụ được việc báo giá cho khách.
 *  - Kiến trúc mới (ADR-005/ADR-008): Meilisearch TÌM ra sản phẩm nào phù hợp,
 *    rồi endpoint này trả GIÁ và TỒN KHO THẬT cho đúng những ID đó.
 *    Nhờ vậy dù index tìm kiếm có lệch, khách vẫn không bao giờ thấy giá sai.
 *
 * POST /ai/products-lookup
 * Body: { ids?: string[], skus?: string[], status?: "draft"|"published"|"all" }   (ids/skus tối đa 100 mỗi loại)
 *   status mặc định "published" (như cũ); "draft"/"all" để bot tìm được sản phẩm đang ẩn.
 *   Sai giá trị => 400 { code: "invalid_status" }.
 */

const pgPool = new Pool({ connectionString: process.env.CONFIG_POSTGRES_URL_MEDUSA });

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized: Invalid x-ai-secret-key header" });
  }

  const body = (req.body ?? {}) as { ids?: unknown; skus?: unknown; status?: unknown };
  const status = body.status === undefined || body.status === null || body.status === "" ? "published" : body.status;
  if (status !== "published" && status !== "draft" && status !== "all") {
    return res.status(400).json({ error: "status chỉ nhận published, draft hoặc all", code: "invalid_status" });
  }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 100) : [];
  const skus = Array.isArray(body.skus) ? body.skus.filter((x): x is string => typeof x === "string").slice(0, 100) : [];

  if (ids.length === 0 && skus.length === 0) {
    return res.status(400).json({ error: "Cần ids[] hoặc skus[]" });
  }

  try {
    const dbRes = await pgPool.query(
      `
      SELECT
        p.id                AS product_id,
        p.title,
        p.handle,
        p.status,
        pv.id               AS variant_id,
        pv.sku,
        pv.title            AS variant_title,
        COALESCE(pr.amount, 0)::bigint                                   AS price_vnd,
        COALESCE(il.stocked_quantity, 0) - COALESCE(il.reserved_quantity, 0) AS ton_kho,
        pv.manage_inventory                                              AS quan_ly_ton_kho
      FROM product p
      JOIN product_variant pv ON pv.product_id = p.id AND pv.deleted_at IS NULL
      LEFT JOIN product_variant_price_set pvps ON pvps.variant_id = pv.id
      LEFT JOIN price pr ON pr.price_set_id = pvps.price_set_id
            AND lower(pr.currency_code) = 'vnd'
            AND pr.deleted_at IS NULL
      LEFT JOIN product_variant_inventory_item pvii ON pvii.variant_id = pv.id
      LEFT JOIN inventory_level il ON il.inventory_item_id = pvii.inventory_item_id
      WHERE p.deleted_at IS NULL
        AND ($3::text = 'all' OR p.status = $3::text)
        AND (
          ($1::text[] IS NOT NULL AND cardinality($1::text[]) > 0 AND p.id = ANY($1::text[]))
          OR
          ($2::text[] IS NOT NULL AND cardinality($2::text[]) > 0 AND pv.sku = ANY($2::text[]))
        )
      `,
      [ids, skus, status]
    );

    const items = (dbRes.rows || []).map((r: any) => ({
      product_id: r.product_id,
      variant_id: r.variant_id,
      sku: r.sku,
      title: r.title,
      variant_title: r.variant_title,
      handle: r.handle,
      price_vnd: Number(r.price_vnd) || 0,
      stock_qty: Number(r.ton_kho) || 0,
      // manage_inventory = false nghĩa là "luôn bán được, không theo dõi số
      // lượng" — KHÔNG phải hết hàng. Những biến thể này không có bản ghi
      // inventory_level nào nên ton_kho luôn ra 0; nếu coi đó là hết hàng thì
      // bot từ chối thêm vào giỏ MỌI sản phẩm và khách không mua được gì.
      // Phát hiện 04/08/2026 trên shop Hasaki (7.869 sản phẩm đều bị chặn).
      in_stock: r.quan_ly_ton_kho === false || (Number(r.ton_kho) || 0) > 0,
    }));

    // Báo rõ ID/SKU nào không tìm thấy — tầng gọi dùng thông tin này để phát hiện
    // LLM bịa SKU thay vì im lặng bỏ qua.
    const thayId = new Set(items.map((i) => i.product_id));
    const thaySku = new Set(items.map((i) => i.sku).filter(Boolean));

    return res.status(200).json({
      ok: true,
      count: items.length,
      items,
      khong_tim_thay: {
        ids: ids.filter((x) => !thayId.has(x)),
        skus: skus.filter((x) => !thaySku.has(x)),
      },
    });
  } catch (err: any) {
    console.error("[ai/products-lookup]", err);
    return res.status(500).json({ error: "Lookup failed" });
  }
}
