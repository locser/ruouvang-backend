import { model } from "@medusajs/framework/utils"

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  KHỐI NỘI DUNG (Page Section)
 * ═══════════════════════════════════════════════════════════════════════
 *  Một khối trên trang: hero, lưới sản phẩm, dải chứng nhận, văn bản…
 *  Đây chính là thứ anh Phong yêu cầu: "nhiều widget, control được
 *  component, bật tắt, sắp xếp thứ tự".
 *
 *  ⚠️ VÌ SAO LÀ BẢNG RIÊNG, KHÔNG PHẢI MẢNG TRONG json() CỦA TEMPLATE:
 *  Medusa MERGE trường json() khi cập nhật thay vì thay thế. Với mảng,
 *  hành vi merge không được tài liệu hoá → xoá section hoặc đổi thứ tự
 *  sẽ cho kết quả không lường được. Bảng riêng + cột `position` né sạch
 *  rủi ro đó, và cho phép truy vấn/lọc theo section.
 * ═══════════════════════════════════════════════════════════════════════
 */
const PageSection = model.define("page_section", {
  id: model.id().primaryKey(),

  /** Trỏ về PageTemplate.id */
  template_id: model.text().index("IDX_page_section_template_id"),

  /**
   * Loại khối — phải khớp một khoá trong SECTION_SCHEMAS
   * (xem ../section-schemas.ts). Ví dụ: "hero", "product_grid".
   */
  type: model.text(),

  /** Thứ tự hiển thị, nhỏ → trên. Cho phép cách quãng (0,10,20…) để chèn giữa. */
  position: model.number().default(0),

  /** BẬT/TẮT khối mà không cần xoá — anh Phong yêu cầu trực tiếp. */
  enabled: model.boolean().default(true),

  /**
   * Cấu hình của khối, hình dạng do SECTION_SCHEMAS quy định.
   *
   * ⚠️ CẠM BẪY BẮT BUỘC BIẾT (tài liệu Medusa, mục JSON properties):
   *   1. json() MERGE khi update — không thay thế.
   *   2. Gửi chuỗi rỗng "" sẽ XOÁ HẲN khoá đó khỏi JSON.
   *   3. Object lồng nhau phải gửi TOÀN BỘ, thiếu trường = mất trường.
   * → Vì vậy tầng API LUÔN gửi trọn vẹn object settings đã qua kiểm tra,
   *   và dùng null thay cho "" (xem validators.ts).
   */
  settings: model.json().nullable(),
})

export default PageSection
