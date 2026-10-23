import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Index cho POST /ai/outbox/claim (quét CHO/DANG_GUI theo tao_luc).
 * Migration-script của Medusa chạy MỘT lần theo tên file khi `medusa db:migrate`; script cũ
 * create-ai-tables.ts đã chạy rồi nên không thể sửa tại chỗ, vì vậy thêm file mới.
 * Idempotent (IF NOT EXISTS).
 */
export default async function createAiOutboxClaimIndex({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const pg = container.resolve("__pg_connection__") as any;
  await pg.raw(
    `CREATE INDEX IF NOT EXISTS idx_ai_outbox_claim ON ai_outbox (tao_luc) WHERE trang_thai IN ('CHO', 'DANG_GUI')`
  );
  logger.info("Index 'idx_ai_outbox_claim' on ai_outbox is ready.");
}
