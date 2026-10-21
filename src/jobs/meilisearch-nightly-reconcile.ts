import type { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { doiSoatMeili } from "../lib/meili-dong-bo-toan-bo";

/**
 * Đối soát Meilisearch hằng đêm (ADR-012) — lưới an toàn cuối cùng.
 *
 * Đây là thứ cho phép ngủ ngon: dù subscriber có lỡ sự kiện, chậm nhất sau một
 * đêm dữ liệu tự khớp lại.
 *
 * HAI LỖI CỦA BẢN TRƯỚC, ĐÃ SỬA:
 *
 * 1. KHÔNG PHÂN TRANG. `query.graph({ filters: { status: "published" } })` bị
 *    Medusa áp giới hạn mặc định (15–50 bản ghi). Với 60.000 sản phẩm, job chỉ
 *    đồng bộ trang đầu rồi ghi log "Hoàn tất đối soát" — báo thành công trong
 *    khi 99,9% dữ liệu chưa được đụng tới. Đây là kiểu lỗi nguy hiểm nhất:
 *    im lặng và trông như đã xong.
 *
 * 2. KHÔNG XOÁ DOCUMENT MỒ CÔI. Chỉ push lại sản phẩm published, nên sản phẩm
 *    đã xoá hoặc gỡ đăng trong Medusa mà subscriber lỡ sự kiện sẽ nằm lại trong
 *    index VĨNH VIỄN — bot tiếp tục tư vấn hàng không còn bán.
 *
 * Nay đối soát BA CHIỀU: thiếu → thêm · thừa → xoá · lệch updated_at → cập nhật.
 * Và ghi log SỐ LỆCH PHÁT HIỆN ĐƯỢC, không chỉ số đã đồng bộ — nếu không thì
 * không ai biết đồng bộ đang hỏng.
 */

export default async function meilisearchNightlyReconcileJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  logger.info("[MeiliReconcile] Bắt đầu đối soát đêm...");

  try {
    // Logic đối soát nằm ở lib, dùng chung với nút "Đồng bộ toàn bộ" trong admin.
    const kq = await doiSoatMeili();

    logger.info(
      `[MeiliReconcile] Xong sau ${kq.giay}s. Đã đọc ${kq.da_doc}/${kq.tong_trong_medusa} sản phẩm. ` +
      `Lệch: thêm ${kq.them_moi}, cập nhật ${kq.cap_nhat}, xoá mồ côi ${kq.xoa_mo_coi} ` +
      `(${kq.ty_le_lech.toFixed(2)}%). Khớp sẵn: ${kq.khop_san}.`
    );

    // Đọc thiếu = phân trang hỏng. Phải kêu to, đây đúng là lỗi bản trước mắc.
    if (kq.da_doc !== kq.tong_trong_medusa) {
      logger.error(
        `[MeiliReconcile] CẢNH BÁO: chỉ đọc được ${kq.da_doc}/${kq.tong_trong_medusa} sản phẩm. ` +
        `Phân trang có vấn đề — KHÔNG được coi lần đối soát này là thành công.`
      );
    }

    // Ngưỡng 0,5% theo tài liệu 04 §5.3.
    if (kq.ty_le_lech > 0.5) {
      logger.error(
        `[MeiliReconcile] CẢNH BÁO: tỷ lệ lệch ${kq.ty_le_lech.toFixed(2)}% vượt ngưỡng 0,5%. ` +
        `Nhiều khả năng subscriber đang rơi sự kiện — cần kiểm tra ngay.`
      );
    }
  } catch (err: any) {
    // Ném lại để Medusa ghi nhận job thất bại thay vì âm thầm coi là xong.
    logger.error(`[MeiliReconcile] Đối soát THẤT BẠI: ${err?.message ?? err}`);
    throw err;
  }
}

export const config = {
  name: "ai-meilisearch-nightly-reconcile",
  schedule: "0 3 * * *", // 03:00 hằng đêm
};
