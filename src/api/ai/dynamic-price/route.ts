import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { checkAuth } from "../../../lib/ai-auth";

/**
 * Định giá động (dinh_gia_dong) — updateProductVariantsWorkflow (v2 tự quản price set).
 * Biên độ (min/max_price_multiplier) đã được kiểm ở tầng AI Daemon dựa trên giá gốc.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized: Invalid x-ai-secret-key header" });
  }
  const { variantId, newPrice, currency } = req.body as {
    variantId: string;
    newPrice: number;
    currency?: string;
  };
  if (!variantId || !newPrice) {
    return res.status(400).json({ error: "Thiếu variantId hoặc newPrice" });
  }
  const currency_code = (currency || "vnd").toLowerCase();

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  try {
    await updateProductVariantsWorkflow(req.scope).run({
      input: {
        product_variants: [
          { id: variantId, prices: [{ amount: Number(newPrice), currency_code }] },
        ],
      } as any,
    });
    return res.status(200).json({
      ok: true,
      message: `Đã cập nhật giá variant ${variantId} = ${newPrice} ${currency_code.toUpperCase()}.`,
    });
  } catch (err: any) {
    logger.error(`dynamic-price lỗi: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
}
