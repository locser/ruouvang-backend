import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import {
  docSanPham,
  dayLenMeili,
  xoaKhoiMeili,
  timProductIdTheoInventoryItem,
} from "../lib/meili-sync";
import type { TaiLieuSanPham } from "../lib/meili-sync";

/**
 * Đồng bộ sản phẩm Medusa → Meilisearch theo thời gian thực (ADR-005, ADR-012).
 *
 * NGUYÊN TẮC:
 *  - ID document trong Meilisearch LUÔN là product.id của Medusa.
 *  - Giá và tồn kho đẩy lên index CHỈ để lọc/sắp xếp. Câu trả lời cho khách
 *    LUÔN đọc lại từ Medusa qua /ai/products-lookup (ADR-008). Nhờ vậy dù index
 *    có lệch, khách vẫn không bao giờ thấy giá sai.
 *
 * VỀ XỬ LÝ LỖI — KHÁC QUAN TRỌNG SO VỚI BẢN TRƯỚC:
 *  Bản trước bắt mọi lỗi rồi `console.error` và đi tiếp. Meilisearch restart
 *  hoặc mạng chớp một nhịp là sự kiện MẤT VĨNH VIỄN, không retry, không cảnh báo.
 *  Nay lỗi được NÉM RA NGOÀI để Redis event bus của Medusa
 *  (@medusajs/medusa/event-bus-redis, đã cấu hình trong medusa-config.ts) tự
 *  retry theo cơ chế hàng đợi sẵn có. Không cần thêm BullMQ.
 */

/** Sự kiện tồn kho: tên nội bộ của Inventory Module, khác hẳn product.updated. */
const SU_KIEN_TON_KHO = new Set([
  "inventory.inventory-level.updated",
  "inventory.inventory-level.created",
  "inventory.inventory-level.deleted",
  "inventory-item.updated",
  "inventory.inventory-item.updated",
]);

export default async function meilisearchProductSyncSubscriber({
  event: { name, data },
}: SubscriberArgs<Record<string, any>>) {
  // ----- Sản phẩm bị xoá -----
  if (name === "product.deleted") {
    const id = data?.id;
    if (id) await xoaKhoiMeili([String(id)]);
    return;
  }

  // ----- Thay đổi tồn kho -----
  //
  // Medusa v2 KHÔNG phát `product.updated` khi tồn kho đổi — Inventory là module
  // riêng. Thiếu nhánh này thì `in_stock` trên index đứng yên vĩnh viễn và bot
  // tiếp tục gợi ý hàng đã bán hết.
  //
  // ⚠️ Đây là internal event của Inventory Module, chưa có trong tài liệu chính
  // thức của Medusa và tên có thể đổi giữa các bản minor. Cách xác nhận: bật log
  // toàn bộ event trong 1 giờ, đổi tồn kho một sản phẩm, xem tên thật là gì rồi
  // bổ sung vào SU_KIEN_TON_KHO. Job đối soát đêm là lưới an toàn cho trường hợp
  // tên sự kiện sai.
  if (SU_KIEN_TON_KHO.has(name)) {
    const inventoryItemId = data?.inventory_item_id ?? data?.id;
    if (!inventoryItemId) return;
    const productIds = await timProductIdTheoInventoryItem(String(inventoryItemId));
    const docs: TaiLieuSanPham[] = [];
    for (const pid of productIds) {
      const doc = await docSanPham(pid);
      if (doc) docs.push(doc);
      else await xoaKhoiMeili([pid]);
    }
    await dayLenMeili(docs);
    return;
  }

  // ----- Sản phẩm tạo mới / cập nhật -----
  const productId = data?.id;
  if (!productId) return;

  const doc = await docSanPham(String(productId));
  if (!doc) {
    // Không tồn tại, đã xoá mềm, hoặc bị gỡ đăng (draft) → phải rút khỏi index,
    // nếu không bot vẫn tư vấn sản phẩm không còn bán.
    await xoaKhoiMeili([String(productId)]);
    return;
  }

  await dayLenMeili([doc]);
}

export const config: SubscriberConfig = {
  event: [
    "product.created",
    "product.updated",
    "product.deleted",
    "inventory.inventory-level.updated",
    "inventory.inventory-level.created",
    "inventory.inventory-level.deleted",
  ],
};
