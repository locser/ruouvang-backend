import { model } from "@medusajs/framework/utils"

/**
 * Khách tiềm năng: người CHƯA mua nhưng đã để lại tên và số điện thoại cho
 * nhân viên gọi tư vấn (thường qua chatbot). Mỗi hội thoại chatbot một dòng.
 */
const KhachTiemNang = model.define("khach_tiem_nang", {
  id: model.id({ prefix: "ktn" }).primaryKey(),
  conversation_id: model.text().unique(),
  ten: model.text().nullable(),
  so_dien_thoai: model.text(),
  nhu_cau: model.text().nullable(),
  nguon: model.text().default("chatbot"),
  trang_thai: model.enum(["moi", "da_goi", "bo_qua"]).default("moi"),
})

export default KhachTiemNang
