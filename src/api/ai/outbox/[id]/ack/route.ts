import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { checkAuth } from "../../../../../lib/ai-auth";
import { OUTBOX_MAX_ATTEMPTS } from "../../../../../lib/outbox";

export { OUTBOX_MAX_ATTEMPTS };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /ai/outbox/:id/ack — báo kết quả gửi một dòng đã claim.
 * Body: { ok: boolean, error?: string, claimed_at?: string }
 *  - claimed_at: chuỗi `claimed_at` nhận từ /claim, gửi lại nguyên văn. Có thì phải khớp xu_ly_luc hiện
 *    tại, lệch (dòng đã bị giành lại) => 409 not_claimed. Thiếu thì chỉ kiểm tra trạng thái DANG_GUI (tương thích cũ).
 *  - ok: trang_thai = DA_GUI.
 *  - không ok: so_lan_thu + 1; đạt 5 lần thì LOI, chưa thì về CHO (gửi lại sau). Lỗi lưu ở du_lieu->'_loi'.
 * Chỉ ack được dòng đang DANG_GUI. Trả { ok:true, id, trang_thai, so_lan_thu }.
 * Mã lỗi: unauthorized, invalid_body (kể cả claimed_at sai định dạng), not_found (404), not_claimed (409), internal_error.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res
      .status(401)
      .json({ error: "Unauthorized: Invalid or missing x-ai-secret-key header", code: "unauthorized" });
  }
  const id = String((req.params as any)?.id ?? "");
  const { ok, error, claimed_at } = (req.body ?? {}) as { ok?: unknown; error?: unknown; claimed_at?: unknown };
  if (typeof ok !== "boolean") {
    return res.status(400).json({ error: "Thiếu ok (true/false)", code: "invalid_body" });
  }
  if (claimed_at !== undefined && claimed_at !== null && (typeof claimed_at !== "string" || !claimed_at)) {
    return res.status(400).json({ error: "claimed_at phải là chuỗi", code: "invalid_body" });
  }
  const claimedAt = typeof claimed_at === "string" ? claimed_at : null;
  const claimSql = claimedAt ? " AND xu_ly_luc = ?::timestamptz" : "";
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
         WHERE id = ? AND trang_thai = 'DANG_GUI'${claimSql}
         RETURNING id, trang_thai, so_lan_thu`,
        claimedAt ? [id, claimedAt] : [id]
      );
    } else {
      const msg = (typeof error === "string" && error ? error : "unknown").slice(0, 500);
      r = await pg.raw(
        `UPDATE ai_outbox
         SET so_lan_thu = so_lan_thu + 1,
             trang_thai = CASE WHEN so_lan_thu + 1 >= ? THEN 'LOI' ELSE 'CHO' END,
             du_lieu = CASE WHEN jsonb_typeof(du_lieu) = 'object'
                            THEN jsonb_set(du_lieu, '{_loi}', to_jsonb(?::text)) ELSE du_lieu END,
             xu_ly_luc = now()
         WHERE id = ? AND trang_thai = 'DANG_GUI'${claimSql}
         RETURNING id, trang_thai, so_lan_thu`,
        claimedAt ? [OUTBOX_MAX_ATTEMPTS, msg, id, claimedAt] : [OUTBOX_MAX_ATTEMPTS, msg, id]
      );
    }
    const row = r?.rows?.[0];
    if (row) return res.status(200).json({ ok: true, ...row });

    const ton = await pg.raw("SELECT trang_thai FROM ai_outbox WHERE id = ?", [id]);
    if ((ton?.rows?.length ?? 0) === 0) {
      return res.status(404).json({ error: "Không tìm thấy tin trong hàng đợi", code: "not_found" });
    }
    return res.status(409).json({
      error: `Tin đang ở trạng thái ${ton.rows[0].trang_thai}, không phải DANG_GUI, hoặc đã bị giành lại (claimed_at lệch)`,
      code: "not_claimed",
    });
  } catch (e: any) {
    if (e?.code === "22007" || e?.code === "22008") {
      return res.status(400).json({ error: "claimed_at sai định dạng thời gian", code: "invalid_body" });
    }
    logger.error(`[outbox-ack] ${e?.message ?? e}`);
    return res.status(500).json({ error: "Không cập nhật được trạng thái tin", code: "internal_error" });
  }
}
