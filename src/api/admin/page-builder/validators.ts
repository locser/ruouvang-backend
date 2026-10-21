import { z } from "@medusajs/framework/zod"

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  KIỂM TRA DỮ LIỆU VÀO (Validators)
 * ═══════════════════════════════════════════════════════════════════════
 *  ⚠️ Zod trong Medusa 2.16.0 là bản 4 (4.2.0), KHÔNG phải bản 3.
 *     Import từ "@medusajs/framework/zod" — TUYỆT ĐỐI không tự
 *     `npm install zod` (sẽ lệch bản và lỗi khó hiểu).
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * 🔴 HÀM QUAN TRỌNG NHẤT FILE NÀY.
 *
 * Medusa xoá HẲN một khoá khỏi trường json() nếu nhận chuỗi rỗng "".
 * Người dùng Admin xoá trắng một ô rồi bấm lưu → khoá biến mất khỏi
 * database, không phải lưu giá trị rỗng như họ tưởng.
 *
 * → Đổi "" thành null NGAY tại cổng vào. null là "không có giá trị"
 *   một cách tường minh và storefront xử lý được.
 */
const emptyStringToNull = z.preprocess(
  (val) => (typeof val === "string" && val.trim() === "" ? null : val),
  z.union([z.string(), z.number(), z.boolean(), z.null()])
)

/** Tạo mẫu trang mới */
export const PostAdminCreatePageTemplate = z.object({
  handle: z
    .string()
    .min(1)
    .regex(
      /^[a-z0-9-]+$/,
      "handle chỉ được chứa chữ thường không dấu, số và dấu gạch ngang"
    ),
  title: z.string().min(1),
  status: z.enum(["draft", "published"]).optional(),
})

/** Sửa mẫu trang */
export const PostAdminUpdatePageTemplate = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(["draft", "published"]).optional(),
})

/** Thêm khối vào trang */
export const PostAdminAddSection = z.object({
  type: z.string().min(1),
})

/**
 * Ghi settings của khối.
 *
 * ⚠️ LUÔN gửi TRỌN VẸN object settings, không gửi từng phần —
 *    json() của Medusa merge chứ không thay thế, gửi thiếu = dữ liệu cũ
 *    còn sót lại lẫn vào.
 */
export const PostAdminUpdateSection = z.object({
  enabled: z.boolean().optional(),
  settings: z.record(z.string(), emptyStringToNull).optional(),
})

/** Sắp xếp lại thứ tự khối — phải gửi ĐỦ id của mọi khối trên trang */
export const PostAdminReorderSections = z.object({
  section_ids: z.array(z.string().min(1)).min(1),
})

export type PostAdminCreatePageTemplateType = z.infer<
  typeof PostAdminCreatePageTemplate
>
export type PostAdminUpdatePageTemplateType = z.infer<
  typeof PostAdminUpdatePageTemplate
>
export type PostAdminAddSectionType = z.infer<typeof PostAdminAddSection>
export type PostAdminUpdateSectionType = z.infer<typeof PostAdminUpdateSection>
export type PostAdminReorderSectionsType = z.infer<
  typeof PostAdminReorderSections
>
