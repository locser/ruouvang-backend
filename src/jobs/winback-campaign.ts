import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Chiến dịch email kéo khách quay lại (gui_email_marketing).
 * Lọc khách CÓ mua trong 90 ngày nhưng KHÔNG phát sinh đơn mới trong 30 ngày gần nhất.
 * Đẩy 1 tác vụ email marketing vào ai_outbox -> Daemon sẽ xin Admin DUYỆT trước khi gửi.
 */
export default async function winbackCampaignJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const pg = container.resolve("__pg_connection__");
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const now = Date.now();
  const lookback = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["email", "created_at"],
      filters: { created_at: { $gte: lookback } } as any,
    });

    const lastByEmail: Record<string, number> = {};
    for (const o of orders || []) {
      const email = (o as any).email;
      if (!email) continue;
      const t = new Date((o as any).created_at).getTime();
      if (!lastByEmail[email] || t > lastByEmail[email]) lastByEmail[email] = t;
    }

    const cutoff = now - 30 * 24 * 60 * 60 * 1000;
    const candidates = Object.entries(lastByEmail)
      .filter(([, t]) => t < cutoff)
      .map(([email]) => email);

    if (candidates.length === 0) {
      logger.info("[winback] Không có khách nào thoả điều kiện 30 ngày.");
      return;
    }

    let maxRec = 200;
    try {
      const r = await pg.raw("SELECT max_email_recipients FROM ai_safety_limit WHERE id = 1");
      maxRec = Number(r.rows?.[0]?.max_email_recipients ?? 200);
    } catch {
      /* mặc định */
    }
    const recipients = candidates.slice(0, Math.min(maxRec, candidates.length));

    // Chống chạy trùng trong ~20 giờ
    const recent = await pg.raw(
      "SELECT id FROM ai_outbox WHERE loai = 'gui_email_marketing' AND tao_luc > NOW() - INTERVAL '20 hours'"
    );
    if (recent.rows.length > 0) return;

    await pg.raw(
      "INSERT INTO ai_outbox (loai, tham_chieu, du_lieu, trang_thai) VALUES (?, ?, ?, ?)",
      [
        "gui_email_marketing",
        `winback-${new Date().toISOString().slice(0, 10)}`,
        JSON.stringify({
          reason: "winback_30_ngay",
          recipientCount: recipients.length,
          recipients,
          suggestedDiscountPercent: 10,
          subject: "Đặc Sản Việt nhớ bạn — ưu đãi quay lại 10%",
        }),
        "CHO",
      ]
    );
    logger.info(`[winback] ${recipients.length} khách vào chiến dịch (chờ Admin duyệt gửi).`);
  } catch (e: any) {
    logger.warn(`[winback] Lỗi lọc khách: ${e.message}`);
  }
}

export const config = {
  name: "ai-winback-campaign",
  schedule: "0 2 * * 1", // 02:00 UTC = 09:00 giờ VN, thứ Hai hằng tuần
};
