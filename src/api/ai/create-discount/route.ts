import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { createPromotionsWorkflow } from "@medusajs/medusa/core-flows";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { checkAuth } from "../../../lib/ai-auth";

/**
 * Tạo mã giảm giá (tao_ma_giam_gia) — createPromotionsWorkflow.
 *  - percent: giảm theo % (ưu tiên).  hoặc  amount: giảm số tiền cố định.
 * Biên độ (max_discount_percent) đã được kiểm ở tầng AI Daemon.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized: Invalid x-ai-secret-key header" });
  }
  const { code, percent, amount, currency } = req.body as {
    code: string;
    percent?: number;
    amount?: number;
    currency?: string;
  };
  if (!code) return res.status(400).json({ error: "Thiếu code (mã giảm giá)" });
  if (!percent && !amount) {
    return res.status(400).json({ error: "Cần percent (%) hoặc amount (số tiền)." });
  }
  const currency_code = (currency || "vnd").toLowerCase();

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  try {
    const application_method = amount
      ? {
          type: "fixed",
          target_type: "order",
          allocation: "across",
          value: Number(amount),
          currency_code,
        }
      : {
          type: "percentage",
          target_type: "order",
          allocation: "across",
          value: Number(percent),
          currency_code,
        };

    const { result } = await createPromotionsWorkflow(req.scope).run({
      input: {
        promotionsData: [
          { code, type: "standard", status: "active", application_method } as any,
        ],
      },
    });
    return res.status(200).json({
      ok: true,
      message: `Đã tạo mã giảm giá ${code}.`,
      promotion: Array.isArray(result) ? result[0] : result,
    });
  } catch (err: any) {
    logger.error(`create-discount lỗi: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
}
