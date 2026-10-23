import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { checkAuth } from "../../../../lib/ai-auth";

/**
 * POST /ai/outbox/claim — chatbot kéo tin trong ai_outbox về để gửi Telegram.
 * Body: { types?: string[], limit?: number (1..50, mặc định 20) }
 * Trả: { items: [{ id, loai, tham_chieu, du_lieu, tao_luc, so_lan_thu }] }
 *
 * Giành nguyên tử (FOR UPDATE SKIP LOCKED): dòng CHO, hoặc DANG_GUI đã treo quá 10 phút,
 * chuyển sang DANG_GUI. Gửi xong phải gọi POST /ai/outbox/:id/ack.
 * Mã lỗi: unauthorized, invalid_body, internal_error.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res
      .status(401)
      .json({ error: "Unauthorized: Invalid or missing x-ai-secret-key header", code: "unauthorized" });
  }
  const body = (req.body ?? {}) as { types?: unknown; limit?: unknown };

  let types: string[] | null = null;
  if (body.types !== undefined && body.types !== null) {
    if (!Array.isArray(body.types) || body.types.some((t) => typeof t !== "string" || !t)) {
      return res.status(400).json({ error: "types phải là mảng chuỗi", code: "invalid_body" });
    }
    types = body.types as string[];
    if (types.length === 0) return res.status(200).json({ items: [] });
  }

  let limit = 20;
  if (body.limit !== undefined && body.limit !== null) {
    const n = Number(body.limit);
    if (!Number.isInteger(n) || n < 1) {
      return res.status(400).json({ error: "limit phải là số nguyên dương", code: "invalid_body" });
    }
    limit = Math.min(n, 50);
  }

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  const pg = req.scope.resolve("__pg_connection__") as any;
  try {
    const loaiSql = types ? `AND loai IN (${types.map(() => "?").join(", ")})` : "";
    const r = await pg.raw(
      `UPDATE ai_outbox SET trang_thai = 'DANG_GUI', xu_ly_luc = now()
       WHERE id IN (
         SELECT id FROM ai_outbox
         WHERE (trang_thai = 'CHO' OR (trang_thai = 'DANG_GUI' AND xu_ly_luc < now() - interval '10 minutes'))
           ${loaiSql}
         ORDER BY tao_luc
         LIMIT ?
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, loai, tham_chieu, du_lieu, tao_luc, so_lan_thu`,
      [...(types ?? []), limit]
    );
    const items = [...(r?.rows ?? [])].sort(
      (a: any, b: any) => new Date(a.tao_luc).getTime() - new Date(b.tao_luc).getTime()
    );
    return res.status(200).json({ items });
  } catch (e: any) {
    logger.error(`[outbox-claim] ${e?.message ?? e}`);
    return res.status(500).json({ error: "Không lấy được hàng đợi tin", code: "internal_error" });
  }
}
