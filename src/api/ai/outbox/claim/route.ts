import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { checkAuth } from "../../../../lib/ai-auth";
import { OUTBOX_MAX_ATTEMPTS } from "../../../../lib/outbox";

/**
 * POST /ai/outbox/claim — chatbot kéo tin trong ai_outbox về để gửi Telegram.
 * Body: { types: string[] (BẮT BUỘC), limit?: number (1..50, mặc định 20) }
 * Trả: { items: [{ id, loai, tham_chieu, du_lieu, tao_luc, so_lan_thu, claimed_at }] }
 *
 * Giành nguyên tử (FOR UPDATE SKIP LOCKED): dòng CHO, hoặc DANG_GUI đã treo quá 10 phút
 * (khi giành lại thì so_lan_thu + 1), chuyển sang DANG_GUI. Chỉ lấy dòng tạo trong 2 ngày
 * gần đây và so_lan_thu < 5; dòng DANG_GUI treo đã đủ 5 lần được chuyển LOI.
 * Dòng CHO cũ hơn 2 ngày được để nguyên (không bị gửi, không bị sửa).
 * `claimed_at` = xu_ly_luc dạng text của Postgres, ĐỦ micro-giây (qua JS Date sẽ mất độ chính
 * xác nên không dùng Date): gửi nguyên chuỗi này lại cho POST /ai/outbox/:id/ack.
 * Không cho claim `chot_don`, `gui_email_marketing` trừ khi truyền rõ trong `types`.
 * Mã lỗi: unauthorized, invalid_body, internal_error.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res
      .status(401)
      .json({ error: "Unauthorized: Invalid or missing x-ai-secret-key header", code: "unauthorized" });
  }
  const body = (req.body ?? {}) as { types?: unknown; limit?: unknown };

  if (!Array.isArray(body.types) || body.types.some((t) => typeof t !== "string" || !t)) {
    return res.status(400).json({ error: "types là bắt buộc và phải là mảng chuỗi", code: "invalid_body" });
  }
  const types = body.types as string[];
  if (types.length === 0) return res.status(200).json({ items: [] });

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
    // Dòng DANG_GUI treo mà đã đủ số lần thử thì dừng hẳn (tránh tin độc lặp mãi).
    await pg.raw(
      `UPDATE ai_outbox
       SET trang_thai = 'LOI', xu_ly_luc = now(),
           du_lieu = CASE WHEN jsonb_typeof(du_lieu) = 'object'
                          THEN jsonb_set(du_lieu, '{_loi}', to_jsonb('claim_timeout'::text)) ELSE du_lieu END
       WHERE trang_thai = 'DANG_GUI' AND xu_ly_luc < now() - interval '10 minutes' AND so_lan_thu >= ?`,
      [OUTBOX_MAX_ATTEMPTS]
    );
    const loaiSql = `AND loai IN (${types.map(() => "?").join(", ")})`;
    const r = await pg.raw(
      `UPDATE ai_outbox
       SET so_lan_thu = so_lan_thu + (CASE WHEN trang_thai = 'DANG_GUI' THEN 1 ELSE 0 END),
           trang_thai = 'DANG_GUI', xu_ly_luc = now()
       WHERE id IN (
         SELECT id FROM ai_outbox
         WHERE (trang_thai = 'CHO' OR (trang_thai = 'DANG_GUI' AND xu_ly_luc < now() - interval '10 minutes'))
           AND so_lan_thu < ?
           AND tao_luc > now() - interval '2 days'
           ${loaiSql}
         ORDER BY tao_luc
         LIMIT ?
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, loai, tham_chieu, du_lieu, tao_luc, so_lan_thu, xu_ly_luc::text AS claimed_at`,
      [OUTBOX_MAX_ATTEMPTS, ...types, limit]
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
