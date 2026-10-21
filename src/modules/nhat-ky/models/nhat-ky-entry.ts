import { model } from "@medusajs/framework/utils"

/**
 * Một dòng nhật ký: ai đã làm gì với đơn hàng hoặc thanh toán, lúc nào,
 * và dữ liệu thay đổi (trước/sau) nếu có. Phục vụ đối soát.
 */
const NhatKyEntry = model.define("nhat_ky_entry", {
  id: model.id({ prefix: "nk" }).primaryKey(),
  doi_tuong: model.text(),
  doi_tuong_id: model.text(),
  hanh_dong: model.text(),
  nguoi_thuc_hien: model.text(),
  truoc: model.json().nullable(),
  sau: model.json().nullable(),
  ghi_chu: model.text().nullable(),
})

export default NhatKyEntry
