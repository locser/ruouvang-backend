import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { checkAuth } from "../../../../../lib/ai-auth";

/** Số lần gửi thất bại tối đa; lần thất bại thứ 5 chuyển dòng sang LOI. */
export const OUTBOX_MAX_ATTEMPTS = 5;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /ai/outbox/:id/ack — báo kết quả gửi một dòng đã claim.
 * Body: { ok: boolean, error?: string }
 *  - ok: trang_thai = DA_GUI.
 *  - không ok: so_lan_thu + 1; đạt 5 lần thì LOI, chưa thì về CHO (gửi lại sau). Lỗi lưu ở du_lieu->'_loi'.
 * Chỉ ack được dòng đang DANG_GUI. Trả { ok:true, id, trang_thai, so_lan_thu }.
 * Mã lỗi: unauthorized, invalid_body, not_found (404), not_claimed (409), internal_error.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res
      .status(401)
      .json({ error: "Unauthorized: Invalid or missing x-ai-secret-key header", code: "unauthorized" });
  }
  const id = String((req.params as any)?.id ?? "");
  const { ok, error } = (req.body ?? {}) as { ok?: unknown; error?: unknown };
  if (typeof ok !== "boolean") {
    return res.status(400).json({ error: "Thiếu ok (true/false)", code: "invalid_body" });
  }
  if (!UUID.test(id)) {
    return res.status(404).json({ error: "Không tìm thấy tin trong hàng đợi", code: "not_found" });
  }

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  const pg = req.scope.resolve("__pg_connection__") as any;
  try {
    let r;
    if (ok) {
      r = await pg.raw(
        `UPDATE ai_outbox SET trang_thai = 'DA_GUI', xu_ly_luc = now()
         WHERE id = ? AND trang_thai = 'DANG_GUI'
         RETURNING id, trang_thai, so_lan_thu`,
        [id]
      );
    } else {
      const msg = (typeof error === "string" && error ? error : "unknown").slice(0, 500);
      r = await pg.raw(
        `UPDATE ai_outbox
         SET so_lan_thu = so_lan_thu + 1,
             trang_thai = CASE WHEN so_lan_thu + 1 >= ? THEN 'LOI' ELSE 'CHO' END,
             du_lieu = jsonb_set(du_lieu, '{_loi}', to_jsonb(?::text)),
             xu_ly_luc = now()
         WHERE id = ? AND trang_thai = 'DANG_GUI'
         RETURNING id, trang_thai, so_lan_thu`,
        [OUTBOX_MAX_ATTEMPTS, msg, id]
      );
    }
    const row = r?.rows?.[0];
    if (row) return res.status(200).json({ ok: true, ...row });

    const ton = await pg.raw("SELECT trang_thai FROM ai_outbox WHERE id = ?", [id]);
    if ((ton?.rows?.length ?? 0) === 0) {
      return res.status(404).json({ error: "Không tìm thấy tin trong hàng đợi", code: "not_found" });
    }
    return res.status(409).json({
      error: `Tin đang ở trạng thái ${ton.rows[0].trang_thai}, không phải DANG_GUI — chưa claim hoặc đã xử lý`,
      code: "not_claimed",
    });
  } catch (e: any) {
    logger.error(`[outbox-ack] ${e?.message ?? e}`);
    return res.status(500).json({ error: "Không cập nhật được trạng thái tin", code: "internal_error" });
  }
}
