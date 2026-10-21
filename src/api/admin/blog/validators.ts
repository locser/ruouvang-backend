import { z } from "@medusajs/framework/zod"

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  Validators cho Blog (Admin)
 * ═══════════════════════════════════════════════════════════════════════
 *  ⚠️ Zod của Medusa 2.16 là bản 4 — import từ "@medusajs/framework/zod",
 *     KHÔNG tự `npm install zod`.
 *
 *  Trường ĐA NGÔN NGỮ là JSON map { [locale]: string }. Medusa MERGE json()
 *  khi update và chuỗi rỗng "" sẽ XOÁ hẳn khoá → đổi "" → null ngay tại cổng
 *  vào, và Admin luôn gửi TRỌN VẸN map (mọi locale đang bật).
 * ═══════════════════════════════════════════════════════════════════════
 */
const localizedMap = z.preprocess((val) => {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = typeof v === "string" && v.trim() === "" ? null : v
    }
    return out
  }
  return val
}, z.record(z.string(), z.union([z.string(), z.null()])).nullable().optional())

const slug = z
  .string()
  .min(1)
  .regex(
    /^[a-z0-9-]+$/,
    "slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang"
  )

/* ───────────────────────────── Bài viết ───────────────────────────── */
export const PostAdminCreateBlogPost = z.object({
  slug,
  status: z.enum(["draft", "published"]).optional(),
  published_at: z.string().nullable().optional(),
  thumbnail: z.string().nullable().optional(),
  author_id: z.string().nullable().optional(),
  category_ids: z.array(z.string()).nullable().optional(),
  tag_ids: z.array(z.string()).nullable().optional(),
  is_featured: z.boolean().optional(),
  title: localizedMap,
  excerpt: localizedMap,
  content: localizedMap,
  seo_title: localizedMap,
  seo_description: localizedMap,
})

export const PostAdminUpdateBlogPost = z.object({
  slug: slug.optional(),
  status: z.enum(["draft", "published"]).optional(),
  published_at: z.string().nullable().optional(),
  thumbnail: z.string().nullable().optional(),
  author_id: z.string().nullable().optional(),
  category_ids: z.array(z.string()).nullable().optional(),
  tag_ids: z.array(z.string()).nullable().optional(),
  is_featured: z.boolean().optional(),
  title: localizedMap,
  excerpt: localizedMap,
  content: localizedMap,
  seo_title: localizedMap,
  seo_description: localizedMap,
})

/* ───────────────────────────── Danh mục ───────────────────────────── */
export const PostAdminCreateBlogCategory = z.object({
  slug,
  name: localizedMap,
  description: localizedMap,
  rank: z.number().optional(),
})
export const PostAdminUpdateBlogCategory = z.object({
  slug: slug.optional(),
  name: localizedMap,
  description: localizedMap,
  rank: z.number().optional(),
})

/* ───────────────────────────── Thẻ (Tag) ──────────────────────────── */
export const PostAdminCreateBlogTag = z.object({ slug, name: localizedMap })
export const PostAdminUpdateBlogTag = z.object({
  slug: slug.optional(),
  name: localizedMap,
})

/* ───────────────────────────── Tác giả ────────────────────────────── */
export const PostAdminCreateBlogAuthor = z.object({
  name: z.string().min(1),
  bio: localizedMap,
  avatar: z.string().nullable().optional(),
})
export const PostAdminUpdateBlogAuthor = z.object({
  name: z.string().min(1).optional(),
  bio: localizedMap,
  avatar: z.string().nullable().optional(),
})

export type PostAdminCreateBlogPostType = z.infer<typeof PostAdminCreateBlogPost>
export type PostAdminUpdateBlogPostType = z.infer<typeof PostAdminUpdateBlogPost>
export type PostAdminCreateBlogCategoryType = z.infer<
  typeof PostAdminCreateBlogCategory
>
export type PostAdminUpdateBlogCategoryType = z.infer<
  typeof PostAdminUpdateBlogCategory
>
export type PostAdminCreateBlogTagType = z.infer<typeof PostAdminCreateBlogTag>
export type PostAdminUpdateBlogTagType = z.infer<typeof PostAdminUpdateBlogTag>
export type PostAdminCreateBlogAuthorType = z.infer<
  typeof PostAdminCreateBlogAuthor
>
export type PostAdminUpdateBlogAuthorType = z.infer<
  typeof PostAdminUpdateBlogAuthor
>
