import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { checkAuth } from "../../../lib/ai-auth";

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized: Invalid x-ai-secret-key header" });
  }

  try {
    const pgConnection = req.scope.resolve("__pg_connection__");
    const result = await pgConnection.raw("SELECT mode FROM ai_control WHERE id = 1");
    const mode = result.rows[0]?.mode || "CHAY";
    
    res.status(200).json({ mode });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized: Invalid x-ai-secret-key header" });
  }

  try {
    const { mode } = req.body as { mode: string };
    if (!["CHAY", "CHI_DOC", "DUNG_HET"].includes(mode)) {
      return res.status(400).json({ error: "Chế độ không hợp lệ. Phải là: CHAY, CHI_DOC, hoặc DUNG_HET" });
    }

    const pgConnection = req.scope.resolve("__pg_connection__");
    await pgConnection.raw("UPDATE ai_control SET mode = ?, updated_at = NOW() WHERE id = 1", [mode]);
    
    res.status(200).json({ ok: true, mode });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
