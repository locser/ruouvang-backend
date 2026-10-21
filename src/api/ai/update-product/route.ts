import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { checkAuth } from "../../../lib/ai-auth";

/**
 * Sửa sản phẩm (them_sua_san_pham - sửa) + ghi mô tả chuẩn SEO (seo_san_pham).
 * update: các trường muốn cập nhật, ví dụ:
 *   { description, title, subtitle, metadata: { seo_title, seo_description }, status }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized: Invalid x-ai-secret-key header" });
  }
  const { id, update } = req.body as { id: string; update: Record<string, any> };
  if (!id || !update || typeof update !== "object") {
    return res.status(400).json({ error: "Thiếu id hoặc update (object các trường cần sửa)." });
  }

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  try {
    const { result } = await updateProductsWorkflow(req.scope).run({
      input: { products: [{ id, ...update }] } as any,
    });
    return res.status(200).json({
      ok: true,
      message: `Đã cập nhật sản phẩm ${id}.`,
      product: Array.isArray(result) ? result[0] : result,
    });
  } catch (err: any) {
    logger.error(`update-product lỗi: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
}
