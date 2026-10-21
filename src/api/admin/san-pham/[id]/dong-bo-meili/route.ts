import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { docSanPham, dayLenMeili, xoaKhoiMeili } from "../../../../../lib/meili-sync"

/**
 * POST /admin/san-pham/:id/dong-bo-meili — đẩy lại MỘT sản phẩm lên Meilisearch.
 *
 * Dùng sau khi đổi giá hoặc tồn kho trong admin, vì trang tìm kiếm của storefront
 * đọc giá từ Meilisearch và Medusa không luôn phát sự kiện đồng bộ khi chỉ đổi giá.
 *
 * Sản phẩm không còn published thì xoá khỏi index, để trang tìm kiếm không hiện
 * một sản phẩm đã gỡ.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const id = req.params.id

  try {
    const doc = await docSanPham(id)
    if (doc) {
      await dayLenMeili([doc])
      res.json({ ok: true, da_dong_bo: true, price_vnd: doc.price_vnd, in_stock: doc.in_stock })
    } else {
      await xoaKhoiMeili([id])
      res.json({ ok: true, da_dong_bo: false, ghi_chu: "Sản phẩm không published nên đã gỡ khỏi tìm kiếm." })
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? "Đồng bộ thất bại" })
  }
}
