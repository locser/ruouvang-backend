import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { checkAuth } from "../../../lib/ai-auth";
import { ghiNhatKy } from "../../../lib/nhat-ky";

/**
 * Đặt giá VND của MỘT variant (chỉ VND, giữ nguyên các tiền tệ khác như AUD).
 *
 * POST /ai/update-price   Body: { variant_id?: string, product_id?: string, amount_vnd: number }
 *  - variant_id được ưu tiên. product_id chỉ dùng được khi sản phẩm có đúng 1 variant;
 *    nhiều hơn => 409 ambiguous_variant kèm `variants: [{id,title,sku,price_vnd}]`.
 *  - amount_vnd: số nguyên 1..1.000.000.000, KHÔNG tự làm tròn (không nguyên => 400 invalid_price).
 *  Trả: { ok, variant_id, product_title, variant_title, old_price_vnd, new_price_vnd }.
 *  Mã lỗi: unauthorized 401, invalid_price 400, invalid_target 400, variant_not_found 404,
 *  product_not_found 404, ambiguous_variant 409, internal_error 500.
 *
 * CÁCH GIỮ GIÁ AUD (Medusa 2.17.2): KHÔNG dùng updatePriceSets, vì nó coi mảng `prices` là toàn bộ giá gốc
 * và gộp theo hash (currency, price_set, price_list, min/max qty, price_rules), không theo id: giá VND
 * gốc và giá VND có rule sẽ trùng khoá, một bản bị đè rồi bị XOÁ. Thay vào đó:
 *   - Đã có giá VND gốc (không rule, không price list): pricing.updatePrices([{ id, amount }]) — cập nhật
 *     đúng một dòng price, mọi giá khác (AUD, VND có rule, price list) không bị đọc lại hay ghi lại.
 *   - Chưa có: pricing.addPrices({ priceSetId, prices: [{ amount, currency_code: "vnd" }] }) — chỉ thêm.
 */

const MAX_VND = 1_000_000_000;

const VARIANT_FIELDS = [
  "id", "title", "sku", "product.id", "product.title",
  "price_set.id",
  "price_set.prices.id", "price_set.prices.currency_code", "price_set.prices.amount",
  "price_set.prices.min_quantity", "price_set.prices.max_quantity",
  "price_set.prices.rules_count", "price_set.prices.price_list_id",
];

/** Giá VND gốc: currency vnd, không rule, không price list. */
function baseVnd(variant: any): any | undefined {
  return (variant?.price_set?.prices ?? []).find(
    (p: any) =>
      p && String(p.currency_code).toLowerCase() === "vnd" && !p.price_list_id && !(Number(p.rules_count) > 0)
  );
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res
      .status(401)
      .json({ error: "Unauthorized: Invalid or missing x-ai-secret-key header", code: "unauthorized" });
  }
  const b = (req.body ?? {}) as { variant_id?: unknown; product_id?: unknown; amount_vnd?: unknown };
  const amount = b.amount_vnd;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 1 || amount > MAX_VND) {
    return res.status(400).json({
      error: "Giá phải là số nguyên VND từ 1 đến 1.000.000.000 (không tự làm tròn).",
      code: "invalid_price",
    });
  }
  const variantId = typeof b.variant_id === "string" && b.variant_id ? b.variant_id : null;
  const productId = typeof b.product_id === "string" && b.product_id ? b.product_id : null;
  if (!variantId && !productId) {
    return res.status(400).json({ error: "Cần variant_id hoặc product_id", code: "invalid_target" });
  }

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  try {
    let variant: any;
    if (variantId) {
      const { data } = await query.graph({ entity: "product_variant", fields: VARIANT_FIELDS, filters: { id: variantId } });
      variant = data?.[0];
      if (!variant) {
        return res.status(404).json({ error: `Không tìm thấy variant ${variantId}`, code: "variant_not_found" });
      }
    } else {
      const { data: prods } = await query.graph({ entity: "product", fields: ["id"], filters: { id: productId! } });
      if (!prods?.[0]) {
        return res.status(404).json({ error: `Không tìm thấy sản phẩm ${productId}`, code: "product_not_found" });
      }
      const { data: vs } = await query.graph({
        entity: "product_variant",
        fields: VARIANT_FIELDS,
        filters: { product_id: productId! },
      });
      if (!vs || vs.length === 0) {
        return res.status(404).json({ error: `Sản phẩm ${productId} chưa có variant nào`, code: "variant_not_found" });
      }
      if (vs.length > 1) {
        return res.status(409).json({
          error: "Sản phẩm có nhiều variant, hãy chọn một variant_id cụ thể.",
          code: "ambiguous_variant",
          variants: vs.map((v: any) => ({
            id: v.id, title: v.title ?? null, sku: v.sku ?? null,
            price_vnd: baseVnd(v) ? Number(baseVnd(v).amount) : null,
          })),
        });
      }
      variant = vs[0];
    }

    const priceSetId: string | undefined = variant.price_set?.id;
    if (!priceSetId) {
      return res.status(500).json({ error: "Variant chưa có price set để đặt giá.", code: "internal_error" });
    }
    const pricing: any = req.scope.resolve(Modules.PRICING);
    const current = baseVnd(variant);
    const oldPrice = current ? Number(current.amount) : null;

    if (current) {
      // Chỉ cập nhật ĐÚNG 1 dòng price theo id (hàm sinh sẵn của MedusaService cho model Price).
      // KHÔNG dùng updatePriceSets: nó gộp giá theo hash (currency, qty, rules...) chứ không theo id.
      await pricing.updatePrices([{ id: current.id, amount }]);
    } else {
      await pricing.addPrices({ priceSetId, prices: [{ amount, currency_code: "vnd" }] });
    }

    await ghiNhatKy(req, {
      doi_tuong: "variant",
      doi_tuong_id: variant.id,
      hanh_dong: "doi_gia_vnd",
      truoc: { price_vnd: oldPrice },
      sau: { price_vnd: amount },
    });
    return res.status(200).json({
      ok: true,
      variant_id: variant.id,
      product_title: variant.product?.title ?? null,
      variant_title: variant.title ?? null,
      old_price_vnd: oldPrice,
      new_price_vnd: amount,
    });
  } catch (e: any) {
    logger.error(`[update-price] ${e?.message ?? e}`);
    return res.status(500).json({ error: e?.message ?? "Lỗi đổi giá", code: "internal_error" });
  }
}
