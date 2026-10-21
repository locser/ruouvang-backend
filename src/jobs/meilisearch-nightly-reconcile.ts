import type { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  docTrangSanPham,
  dayLenMeili,
  xoaKhoiMeili,
  docToanBoIdTrongIndex,
  layPool,
  TaiLieuSanPham,
} from "../lib/meili-sync";

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

const LO_DOC = 500;   // số sản phẩm đọc mỗi trang từ PostgreSQL
const LO_DAY = 500;   // số document đẩy mỗi lô lên Meilisearch

export default async function meilisearchNightlyReconcileJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const batDau = Date.now();

  logger.info("[MeiliReconcile] Bắt đầu đối soát đêm...");

  try {
    // --- Bước 1: tổng số sản phẩm published, để đối chiếu cuối cùng ---
    const dem = await layPool().query(
      `SELECT COUNT(*)::int AS n FROM product WHERE deleted_at IS NULL AND status = 'published'`
    );
    const tongTrongMedusa: number = dem.rows[0]?.n ?? 0;
    logger.info(`[MeiliReconcile] Medusa có ${tongTrongMedusa} sản phẩm published.`);

    // --- Bước 2: ảnh chụp hiện trạng index ---
    const trongIndex = await docToanBoIdTrongIndex();
    logger.info(`[MeiliReconcile] Meilisearch đang có ${trongIndex.size} document.`);

    // --- Bước 3: duyệt toàn bộ Medusa theo trang, so từng sản phẩm ---
    const daThay = new Set<string>();
    let themMoi = 0;
    let capNhat = 0;
    let khongDoi = 0;
    let daDoc = 0;
    let hangCho: TaiLieuSanPham[] = [];

    const dayHangCho = async () => {
      if (hangCho.length === 0) return;
      await dayLenMeili(hangCho);
      hangCho = [];
    };

    for (let offset = 0; ; offset += LO_DOC) {
      const trang = await docTrangSanPham(LO_DOC, offset);
      if (trang.length === 0) break;
      daDoc += trang.length;

      for (const doc of trang) {
        daThay.add(doc.id);
        const uaTrongIndex = trongIndex.get(doc.id);

        if (uaTrongIndex === undefined) {
          themMoi++;
          hangCho.push(doc);
        } else if (uaTrongIndex !== doc.updated_at) {
          capNhat++;
          hangCho.push(doc);
        } else {
          khongDoi++;
        }

        if (hangCho.length >= LO_DAY) await dayHangCho();
      }

      if (trang.length < LO_DOC) break;
    }
    await dayHangCho();

    // --- Bước 4: xoá document mồ côi (có trong index, không còn published) ---
    const moCoi: string[] = [];
    for (const id of trongIndex.keys()) {
      if (!daThay.has(id)) moCoi.push(id);
    }
    for (let i = 0; i < moCoi.length; i += LO_DAY) {
      await xoaKhoiMeili(moCoi.slice(i, i + LO_DAY));
    }

    // --- Bước 5: kết luận và cảnh báo ---
    const tongLech = themMoi + capNhat + moCoi.length;
    const tyLeLech = tongTrongMedusa > 0 ? (tongLech / tongTrongMedusa) * 100 : 0;
    const giay = Math.round((Date.now() - batDau) / 1000);

    logger.info(
      `[MeiliReconcile] Xong sau ${giay}s. Đã đọc ${daDoc}/${tongTrongMedusa} sản phẩm. ` +
      `Lệch: thêm ${themMoi}, cập nhật ${capNhat}, xoá mồ côi ${moCoi.length} ` +
      `(tổng ${tongLech} = ${tyLeLech.toFixed(2)}%). Khớp sẵn: ${khongDoi}.`
    );

    // Đọc thiếu = phân trang hỏng. Phải kêu to, đây đúng là lỗi bản trước mắc.
    if (daDoc !== tongTrongMedusa) {
      logger.error(
        `[MeiliReconcile] CẢNH BÁO: chỉ đọc được ${daDoc}/${tongTrongMedusa} sản phẩm. ` +
        `Phân trang có vấn đề — KHÔNG được coi lần đối soát này là thành công.`
      );
    }

    // Ngưỡng 0,5% theo tài liệu 04 §5.3.
    if (tyLeLech > 0.5) {
      logger.error(
        `[MeiliReconcile] CẢNH BÁO: tỷ lệ lệch ${tyLeLech.toFixed(2)}% vượt ngưỡng 0,5%. ` +
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
