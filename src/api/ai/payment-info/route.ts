import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { checkAuth } from "../../../lib/ai-auth";
import { layCaiDat } from "../../../lib/lay-cai-dat";

/**
 * API trả về cấu hình tài khoản ngân hàng của cửa hàng cho Chatbot.
 * GET /ai/payment-info
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized: Invalid x-ai-secret-key header" });
  }

  const cd = await layCaiDat(req.scope);
  return res.status(200).json({
    ok: true,
    bank_name: cd.bank_name ?? "",
    bank_account: cd.bank_account ?? "",
    bank_account_name: cd.bank_account_name ?? "",
    bank_bin: cd.bank_bin ?? ""
  });
}
