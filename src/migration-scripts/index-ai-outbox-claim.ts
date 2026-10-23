import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Index cho POST /ai/outbox/claim (quét CHO/DANG_GUI theo tao_luc).
 * Medusa chạy migration-scripts theo thứ tự tên file (localeCompare). File này PHẢI đứng sau
 * create-ai-tables.ts (nơi tạo ai_outbox) — tên cũ create-ai-outbox-claim-index.ts chạy trước
 * trên DB trắng và nổ "relation ai_outbox does not exist". Đổi tên nên DB đã chạy tên cũ sẽ chạy
 * lại một lần: an toàn vì IF NOT EXISTS. Chưa có bảng thì ghi log và bỏ qua (không ném lỗi).
 */
export default async function createAiOutboxClaimIndex({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const pg = container.resolve("__pg_connection__") as any;
  const t = await pg.raw(`SELECT to_regclass('public.ai_outbox') AS t`);
  if (!t?.rows?.[0]?.t) {
    logger.warn("Bảng ai_outbox chưa tồn tại — bỏ qua tạo index 'idx_ai_outbox_claim'.");
    return;
  }
  await pg.raw(
    `CREATE INDEX IF NOT EXISTS idx_ai_outbox_claim ON ai_outbox (tao_luc) WHERE trang_thai IN ('CHO', 'DANG_GUI')`
  );
  logger.info("Index 'idx_ai_outbox_claim' on ai_outbox is ready.");
}
