import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Migration BỔ SUNG (idempotent, KHÔNG xoá dữ liệu) cho lớp vận hành AI:
 *   - ai_safety_limit : biên độ an toàn để AI tự duyệt (Phần 2 đặc tả).
 *   - ai_faq          : cơ sở tri thức trả lời tự động (Trụ cột 3 - CSKH).
 *
 * Chạy:  docker exec -w /app/apps/backend medusa-backend \
 *          npx medusa exec src/migration-scripts/add-ai-safety-and-knowledge.ts
 *
 * An toàn chạy lại nhiều lần: dùng CREATE TABLE IF NOT EXISTS + INSERT có điều kiện.
 */
export default async function addAiSafetyAndKnowledge({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  logger.info("[AI migration] Tạo bảng biên độ an toàn + tri thức FAQ (idempotent)...");

  const pgConnection = container.resolve("__pg_connection__");
  if (!pgConnection || typeof pgConnection.raw !== "function") {
    throw new Error("Không resolve được kết nối Knex từ __pg_connection__");
  }

  // 1) ai_safety_limit — biên độ tự duyệt động
  //    auto_pilot = FALSE  => "duyệt tay trước": mọi hành động đụng tiền phải Admin bấm Duyệt,
  //                           kể cả khi còn trong biên độ. Bật TRUE để cho AI tự duyệt trong biên độ.
  await pgConnection.raw(`
    CREATE TABLE IF NOT EXISTS ai_safety_limit (
      id SERIAL PRIMARY KEY,
      max_discount_percent  INT           NOT NULL DEFAULT 20,      -- % giảm giá tối đa AI tự tạo
      min_price_multiplier  NUMERIC(4,2)  NOT NULL DEFAULT 0.85,    -- giá sàn = 85% giá gốc
      max_price_multiplier  NUMERIC(4,2)  NOT NULL DEFAULT 1.20,    -- giá trần = 120% giá gốc
      max_inventory_change  INT           NOT NULL DEFAULT 200,     -- số lượng kho tối đa AI tự đổi/lần
      max_refund_amount     BIGINT        NOT NULL DEFAULT 1000000, -- tiền hoàn tối đa AI tự duyệt (VND)
      max_email_recipients  INT           NOT NULL DEFAULT 200,     -- số email tối đa 1 chiến dịch AI tự gửi
      low_stock_threshold   INT           NOT NULL DEFAULT 5,       -- ngưỡng cảnh báo hết hàng
      auto_pilot            BOOLEAN       NOT NULL DEFAULT FALSE,   -- FALSE = duyệt tay trước cho mọi việc đụng tiền
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Bổ sung cột nếu bảng đã tồn tại từ phiên bản trước (an toàn khi nâng cấp)
  await pgConnection.raw(
    `ALTER TABLE ai_safety_limit ADD COLUMN IF NOT EXISTS auto_pilot BOOLEAN NOT NULL DEFAULT FALSE;`
  );
  await pgConnection.raw(
    `ALTER TABLE ai_safety_limit ADD COLUMN IF NOT EXISTS max_email_recipients INT NOT NULL DEFAULT 200;`
  );
  await pgConnection.raw(
    `ALTER TABLE ai_safety_limit ADD COLUMN IF NOT EXISTS low_stock_threshold INT NOT NULL DEFAULT 5;`
  );
  await pgConnection.raw(
    `INSERT INTO ai_safety_limit (id) VALUES (1) ON CONFLICT (id) DO NOTHING;`
  );
  logger.info("[AI migration] Bảng 'ai_safety_limit' sẵn sàng (mặc định id=1, auto_pilot=FALSE).");

  // 2) ai_faq — cơ sở tri thức cho trả lời FAQ tự động
  await pgConnection.raw(`
    CREATE TABLE IF NOT EXISTS ai_faq (
      id SERIAL PRIMARY KEY,
      cau_hoi   TEXT    NOT NULL,
      tra_loi   TEXT    NOT NULL,
      tu_khoa   TEXT,
      kich_hoat BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pgConnection.raw(
    `CREATE INDEX IF NOT EXISTS idx_ai_faq_kich_hoat ON ai_faq (kich_hoat);`
  );

  // Seed vài FAQ mặc định cho thương hiệu "Đặc Sản Việt" (chỉ khi bảng còn trống)
  await pgConnection.raw(`
    INSERT INTO ai_faq (cau_hoi, tra_loi, tu_khoa)
    SELECT * FROM (VALUES
      ('Phí giao hàng bao nhiêu?',
       'Shop hỗ trợ giao toàn quốc. Phí ship tính theo địa chỉ nhận và được báo rõ khi anh/chị đặt hàng. Đơn nội thành giá trị lớn thường được ưu đãi phí vận chuyển.',
       'ship,giao hang,phi,van chuyen,phi ship'),
      ('Bao lâu thì nhận được hàng?',
       'Nội thành thường 1-2 ngày, tỉnh xa 2-4 ngày tuỳ đơn vị vận chuyển. Shop sẽ gửi mã vận đơn để anh/chị theo dõi hành trình đơn hàng.',
       'bao lau,thoi gian,nhan hang,giao hang,may ngay'),
      ('Sản phẩm bảo quản thế nào?',
       'Mỗi đặc sản đều ghi rõ hạn dùng và cách bảo quản trên bao bì. Phần lớn nên bảo quản nơi khô mát hoặc ngăn mát/đông tủ lạnh để giữ trọn hương vị.',
       'bao quan,han dung,de duoc lau,cach giu'),
      ('Shop có đổi trả / xuất hoá đơn không?',
       'Shop hỗ trợ đổi trả với sản phẩm lỗi do vận chuyển hoặc sai mô tả — anh/chị vui lòng quay video/chụp hình khi mở hàng. Nhu cầu hoá đơn VAT xin báo trước khi đặt.',
       'doi tra,hoan tien,hoa don,vat,bao hanh')
    ) AS v(cau_hoi, tra_loi, tu_khoa)
    WHERE NOT EXISTS (SELECT 1 FROM ai_faq);
  `);
  logger.info("[AI migration] Bảng 'ai_faq' sẵn sàng + đã seed FAQ mặc định.");

  // 3) ai_batch — theo dõi job Batch API (VD SEO hàng loạt, rẻ ~50%)
  await pgConnection.raw(`
    CREATE TABLE IF NOT EXISTS ai_batch (
      id SERIAL PRIMARY KEY,
      batch_id   TEXT NOT NULL,
      loai       TEXT NOT NULL,
      trang_thai TEXT NOT NULL DEFAULT 'DANG_CHAY',
      du_lieu    JSONB DEFAULT '{}'::jsonb,
      tao_luc    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      xong_luc   TIMESTAMP WITH TIME ZONE
    );
  `);
  await pgConnection.raw(
    `CREATE INDEX IF NOT EXISTS idx_ai_batch_trang_thai ON ai_batch (trang_thai);`
  );
  logger.info("[AI migration] Bảng 'ai_batch' sẵn sàng.");

  logger.info("[AI migration] Hoàn tất tạo bảng biên độ an toàn & tri thức FAQ.");
}
