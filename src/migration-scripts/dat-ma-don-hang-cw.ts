import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Mã đơn hàng dạng CW100001, CW100002, ... lưu trong `order.custom_display_id`.
 *
 * VÌ SAO LÀ TRIGGER CỦA POSTGRES, KHÔNG PHẢI MÃ ỨNG DỤNG:
 *   Nếu ứng dụng tự "đọc số lớn nhất rồi cộng 1", hai khách đặt cùng lúc ở hai
 *   client sẽ cùng đọc một số và sinh MÃ TRÙNG. Sequence của Postgres cấp số
 *   nguyên tử (hai phiên không bao giờ nhận cùng một số) nên:
 *     1. `order.display_id` (serial) lấy từ `order_display_id_seq`, bắt đầu từ 100001.
 *     2. Trigger BEFORE INSERT gán `custom_display_id = 'CW' || display_id` trong
 *        cùng câu INSERT, nên mọi đường tạo đơn (storefront, admin, chatbot) đều có mã.
 *     3. Unique index có sẵn của Medusa (`IDX_order_custom_display_id`) là lưới an
 *        toàn cuối cùng: có lỗi nào khác thì INSERT thất bại chứ không bao giờ ghi
 *        hai đơn cùng mã.
 *   Chú ý: sequence không đảm bảo liền mạch (giao dịch bị huỷ sẽ bỏ lọt một số);
 *   mã luôn duy nhất và tăng dần nhưng có thể có khoảng trống.
 *
 * AN TOÀN, chạy lại không hại:
 *   - KHÔNG đổi `display_id` của đơn đã có (chatbot và route nội bộ tra theo số này).
 *   - Chỉ nâng sequence khi thấp hơn mốc, không bao giờ hạ.
 *   - Đơn cũ chưa có mã được điền `CW<display_id>` (không đụng đơn đã có mã).
 *
 * Medusa tự chạy file này một lần ở `medusa db:migrate`.
 */
const MOC_HIEN_TAI = 100000; // đơn kế tiếp sẽ là MOC + 1 = 100001

export default async function datMaDonHangCw({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const pg = container.resolve("__pg_connection__");

  // 1. Nâng sequence lên mốc (chỉ khi thấp hơn).
  const kq = await pg.raw("SELECT last_value FROM order_display_id_seq");
  const hienTai = Number(kq.rows[0].last_value);
  if (hienTai < MOC_HIEN_TAI) {
    await pg.raw("SELECT setval('order_display_id_seq', ?, true)", [MOC_HIEN_TAI]);
    logger.info(`[ma-don-hang] sequence ${hienTai} -> ${MOC_HIEN_TAI}: đơn kế tiếp là ${MOC_HIEN_TAI + 1}.`);
  } else {
    logger.info(`[ma-don-hang] sequence đang ở ${hienTai}, đã đạt mốc: giữ nguyên.`);
  }

  // 2. Điền mã cho đơn cũ chưa có (kể cả đơn đã xoá mềm, để index duy nhất nhất quán).
  const dienCu = await pg.raw(
    `UPDATE "order" SET custom_display_id = 'CW' || display_id WHERE custom_display_id IS NULL`
  );
  logger.info(`[ma-don-hang] đã điền mã cho ${dienCu.rowCount ?? 0} đơn cũ.`);

  // 3. Trigger gán mã cho đơn mới. DEFAULT của display_id đã được áp trước khi
  //    trigger BEFORE INSERT chạy, nên NEW.display_id đã có số.
  await pg.raw(`
    CREATE OR REPLACE FUNCTION order_gan_ma_cw() RETURNS trigger AS $fn$
    BEGIN
      IF NEW.custom_display_id IS NULL THEN
        NEW.custom_display_id := 'CW' || NEW.display_id;
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;
  `);
  await pg.raw(`DROP TRIGGER IF EXISTS trg_order_gan_ma_cw ON "order"`);
  await pg.raw(`
    CREATE TRIGGER trg_order_gan_ma_cw
    BEFORE INSERT ON "order"
    FOR EACH ROW EXECUTE FUNCTION order_gan_ma_cw()
  `);

  // Lưới an toàn chống trùng đã có sẵn: Medusa tạo UNIQUE INDEX
  // "IDX_order_custom_display_id" trên (custom_display_id) WHERE deleted_at IS NULL.
  logger.info("[ma-don-hang] xong: trigger đã sẵn sàng.");
}
