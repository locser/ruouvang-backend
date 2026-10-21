import { model } from "@medusajs/framework/utils"

/**
 * Một cài đặt của cửa hàng dạng khoá/giá trị (hotline, ngân hàng, SMTP...).
 *
 * Tên bảng ép là `app_settings` (khớp bảng cùng tên bên chatbot, nhưng ĐÂY là DB
 * của Medusa - hai bên không dùng chung dữ liệu). Mỗi khoá chỉ nằm ở một nơi.
 *
 * `key` có unique một phần (chỉ tính bản ghi chưa xoá mềm), Medusa tự sinh chỉ mục
 * IDX_app_settings_key_unique ... WHERE deleted_at IS NULL, khớp với migration viết tay.
 * Giá trị của khoá bí mật được MÃ HOÁ trước khi vào cột `value` (xem ma-hoa.ts).
 */
const AppSetting = model.define(
  { name: "AppSetting", tableName: "app_settings" },
  {
    id: model.id({ prefix: "as" }).primaryKey(),
    key: model.text().unique(),
    value: model.text().default(""),
    is_secret: model.boolean().default(false),
    updated_by: model.text().nullable(),
  }
)

export default AppSetting
