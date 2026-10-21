import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { createProductsWorkflow } from "@medusajs/medusa/core-flows";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { checkAuth } from "../../../lib/ai-auth";

/**
 * Thêm sản phẩm mới (them_sua_san_pham - tạo).
 * AN TOÀN: mặc định status = "draft" — sản phẩm do AI tạo KHÔNG tự lên kệ,
 * Admin xem lại rồi mới publish (tránh sai sót ra mặt tiền cửa hàng).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized: Invalid x-ai-secret-key header" });
  }
  const { product } = req.body as { product: any };
  if (!product || !product.title) {
    return res.status(400).json({ error: "Thiếu product.title" });
  }

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  try {
    const input = { products: [{ status: "draft", ...product }] };
    const { result } = await createProductsWorkflow(req.scope).run({ input: input as any });
    return res.status(200).json({
      ok: true,
      message: `Đã tạo sản phẩm nháp: ${product.title}. Vào Admin xem lại rồi Publish.`,
      product: Array.isArray(result) ? result[0] : result,
    });
  } catch (err: any) {
    logger.error(`create-product lỗi: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
}
