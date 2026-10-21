import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

export default async function createAiTables({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  logger.info("Initializing creation of AI Operational tables with trace logging...");

  try {
    const pgConnection = container.resolve("__pg_connection__");
    if (!pgConnection || typeof pgConnection.raw !== "function") {
      throw new Error("Unable to resolve Knex database connection from __pg_connection__");
    }

    logger.info("Database connection resolved. Dropping existing tables to apply schema changes...");
    
    // Drop CHỈ KHI CONFIG_AI_MIGRATION_RESET=true (tránh mất dữ liệu production khi chạy lại migration)
    if (process.env.CONFIG_AI_MIGRATION_RESET === "true") {
      logger.warn("CONFIG_AI_MIGRATION_RESET=true -> DROP toàn bộ bảng AI (XÓA dữ liệu cũ!).");
      await pgConnection.raw("DROP TABLE IF EXISTS ai_action_log CASCADE;");
      await pgConnection.raw("DROP TABLE IF EXISTS ai_outbox CASCADE;");
      await pgConnection.raw("DROP TABLE IF EXISTS ai_control CASCADE;");
    }

    // 1. ai_control table
    await pgConnection.raw(`
      CREATE TABLE IF NOT EXISTS ai_control (
        id SERIAL PRIMARY KEY,
        mode VARCHAR(50) NOT NULL DEFAULT 'CHAY',
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    logger.info("Table 'ai_control' created.");

    // Insert default 'CHAY' status
    await pgConnection.raw("INSERT INTO ai_control (id, mode) VALUES (1, 'CHAY') ON CONFLICT (id) DO NOTHING");
    logger.info("Inserted default row into 'ai_control'.");

    // 2. ai_action_log table with trace column
    await pgConnection.raw(`
      CREATE TABLE IF NOT EXISTS ai_action_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        idempotency_key TEXT NOT NULL UNIQUE,
        hanh_dong TEXT NOT NULL,
        tham_so JSONB NOT NULL,
        trang_thai TEXT NOT NULL,
        ket_qua JSONB,
        outbox_id UUID,
        trace JSONB NOT NULL DEFAULT '{}'::jsonb,
        tao_luc TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        xong_luc TIMESTAMP WITH TIME ZONE
      );
    `);
    await pgConnection.raw(`
      CREATE INDEX IF NOT EXISTS idx_ai_action_log_tao_luc 
      ON ai_action_log (tao_luc DESC);
    `);
    logger.info("Table 'ai_action_log' and its index created.");

    // 3. ai_outbox table
    await pgConnection.raw(`
      CREATE TABLE IF NOT EXISTS ai_outbox (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        loai TEXT NOT NULL,
        tham_chieu TEXT NOT NULL,
        du_lieu JSONB NOT NULL,
        trang_thai TEXT NOT NULL DEFAULT 'CHO',
        so_lan_thu INTEGER NOT NULL DEFAULT 0,
        tao_luc TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        xu_ly_luc TIMESTAMP WITH TIME ZONE
      );
    `);
    await pgConnection.raw(`
      CREATE INDEX IF NOT EXISTS idx_ai_outbox_trang_thai_tao_luc 
      ON ai_outbox (trang_thai, tao_luc) 
      WHERE trang_thai IN ('CHO', 'DANG_XU_LY');
    `);
    logger.info("Table 'ai_outbox' and its index created.");

    logger.info("All AI Operational database tables have been verified and set up successfully!");
  } catch (err: any) {
    logger.error(`Failed to initialize database tables: ${err.message}`);
    throw err;
  }
}
