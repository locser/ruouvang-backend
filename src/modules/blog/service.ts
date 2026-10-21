import { MedusaService } from "@medusajs/framework/utils"
import BlogPost from "./models/blog-post"
import BlogCategory from "./models/blog-category"
import BlogTag from "./models/blog-tag"
import BlogAuthor from "./models/blog-author"

/**
 * Locale mặc định để fallback khi bài chưa có bản dịch cho locale đang xem.
 * Khớp DEFAULT_LOCALE của storefront (src/i18n/request.ts).
 */
export const BLOG_DEFAULT_LOCALE = "vi-VN"

type LocaleMap = Record<string, unknown> | null | undefined

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  DỊCH VỤ BLOG
 * ═══════════════════════════════════════════════════════════════════════
 *  MedusaService tự sinh CRUD theo KHOÁ dưới đây:
 *    listBlogPosts · listAndCountBlogPosts · retrieveBlogPost ·
 *    createBlogPosts · updateBlogPosts · deleteBlogPosts  (+ BlogCategory,
 *    BlogTag, BlogAuthor tương tự) · softDelete/restore.
 *
 *  Phần custom bên dưới lo: chọn đúng locale (fallback), lọc theo
 *  danh mục/tag, đính kèm tác giả + danh mục, và tính "bài liên quan".
 *
 *  ⚠️ Mọi method PHẢI async (Medusa luôn await). Có constructor thì gọi
 *     super(...arguments).
 * ═══════════════════════════════════════════════════════════════════════
 */
class BlogModuleService extends MedusaService({
  BlogPost,
  BlogCategory,
  BlogTag,
  BlogAuthor,
}) {
  /** Chọn giá trị theo locale: locale yêu cầu → mặc định → khoá đầu tiên có nội dung. */
  private pick(map: LocaleMap, locale: string): string | null {
    if (!map || typeof map !== "object") return null
    const m = map as Record<string, unknown>
    for (const k of [locale, BLOG_DEFAULT_LOCALE]) {
      const v = m[k]
      if (typeof v === "string" && v.trim() !== "") return v
    }
    for (const k of Object.keys(m)) {
      const v = m[k]
      if (typeof v === "string" && v.trim() !== "") return v
    }
    return null
  }

  /** Ước lượng thời gian đọc (phút) từ nội dung Markdown. */
  private readingMinutes(markdown: string | null): number {
    if (!markdown) return 1
    const words = markdown
      .replace(/[#>*_`~\-\[\]()!]/g, " ")
      .split(/\s+/)
      .filter(Boolean).length
    return Math.max(1, Math.round(words / 200))
  }

  private categorySummary(cat: any, locale: string) {
    return {
      id: cat.id,
      slug: cat.slug,
      name: this.pick(cat.name, locale) ?? cat.slug,
    }
  }

  private tagSummary(tag: any, locale: string) {
    return {
      id: tag.id,
      slug: tag.slug,
      name: this.pick(tag.name, locale) ?? tag.slug,
    }
  }

  private authorSummary(author: any, locale: string) {
    if (!author) return null
    return {
      id: author.id,
      name: author.name,
      avatar: author.avatar ?? null,
      bio: this.pick(author.bio, locale),
    }
  }

  /** Trả về bài đã "phẳng hoá" theo locale. full=true kèm content (Markdown). */
  private localizePost(post: any, locale: string, opts: { full?: boolean } = {}) {
    const localizedContent = this.pick(post.content, locale)
    return {
      id: post.id,
      slug: post.slug,
      status: post.status,
      published_at: post.published_at ?? null,
      thumbnail: post.thumbnail ?? null,
      is_featured: !!post.is_featured,
      title: this.pick(post.title, locale) ?? post.slug,
      excerpt: this.pick(post.excerpt, locale),
      seo_title: this.pick(post.seo_title, locale),
      seo_description: this.pick(post.seo_description, locale),
      reading_minutes: this.readingMinutes(localizedContent),
      ...(opts.full ? { content: localizedContent } : {}),
    }
  }

  /** Bài "còn hiệu lực": đã published và published_at (nếu có) không ở tương lai. */
  private isLive(post: any, now: Date): boolean {
    if (post.status !== "published") return false
    if (post.published_at && new Date(post.published_at) > now) return false
    return true
  }

  private sortByDateDesc(posts: any[]) {
    return [...posts].sort((a, b) => {
      const da = new Date(a.published_at ?? a.created_at ?? 0).getTime()
      const db = new Date(b.published_at ?? b.created_at ?? 0).getTime()
      return db - da
    })
  }

  /**
   * Danh sách bài đã đăng cho storefront, đã bản-địa-hoá theo locale,
   * lọc tuỳ chọn theo danh mục/tag (theo slug), phân trang.
   */
  async listPublishedPosts(params: {
    locale: string
    categorySlug?: string | null
    tagSlug?: string | null
    limit?: number
    offset?: number
  }) {
    const locale = params.locale || BLOG_DEFAULT_LOCALE
    const limit = params.limit ?? 12
    const offset = params.offset ?? 0
    const now = new Date()

    const all = await this.listBlogPosts({ status: "published" })
    let live = all.filter((p: any) => this.isLive(p, now))

    if (params.categorySlug) {
      const [cat] = await this.listBlogCategories({ slug: params.categorySlug })
      if (!cat) return { posts: [], count: 0 }
      live = live.filter(
        (p: any) =>
          Array.isArray(p.category_ids) && p.category_ids.includes(cat.id)
      )
    }

    if (params.tagSlug) {
      const [tag] = await this.listBlogTags({ slug: params.tagSlug })
      if (!tag) return { posts: [], count: 0 }
      live = live.filter(
        (p: any) => Array.isArray(p.tag_ids) && p.tag_ids.includes(tag.id)
      )
    }

    const sorted = this.sortByDateDesc(live)
    const count = sorted.length
    const pageItems = sorted.slice(offset, offset + limit)

    // Nạp tác giả + danh mục một lần rồi ghép (tránh N+1)
    const [authors, categories] = await Promise.all([
      this.listBlogAuthors({}),
      this.listBlogCategories({}),
    ])
    const authorById = new Map(authors.map((a: any) => [a.id, a]))
    const catById = new Map(categories.map((c: any) => [c.id, c]))

    const posts = pageItems.map((p: any) => ({
      ...this.localizePost(p, locale),
      author: this.authorSummary(authorById.get(p.author_id), locale),
      categories: (Array.isArray(p.category_ids) ? p.category_ids : [])
        .map((id: string) => catById.get(id))
        .filter(Boolean)
        .map((c: any) => this.categorySummary(c, locale)),
    }))

    return { posts, count }
  }

  /** Chi tiết một bài theo slug (kèm content, tác giả, danh mục, tag, bài liên quan). */
  async getPublishedPostBySlug(slug: string, locale: string) {
    const loc = locale || BLOG_DEFAULT_LOCALE
    const now = new Date()

    const [post] = await this.listBlogPosts({ slug })
    if (!post || !this.isLive(post, now)) return null

    const [authors, cats, tags] = await Promise.all([
      post.author_id ? this.listBlogAuthors({ id: post.author_id }) : Promise.resolve([]),
      Array.isArray(post.category_ids) && post.category_ids.length
        ? this.listBlogCategories({ id: post.category_ids })
        : Promise.resolve([]),
      Array.isArray(post.tag_ids) && post.tag_ids.length
        ? this.listBlogTags({ id: post.tag_ids })
        : Promise.resolve([]),
    ])

    // Bài liên quan: cùng ít nhất một danh mục, khác chính nó, còn hiệu lực, tối đa 3
    let related: any[] = []
    if (Array.isArray(post.category_ids) && post.category_ids.length) {
      const pool = (await this.listBlogPosts({ status: "published" }))
        .filter((p: any) => p.id !== post.id && this.isLive(p, now))
        .filter(
          (p: any) =>
            Array.isArray(p.category_ids) &&
            p.category_ids.some((id: string) => (post.category_ids as any).includes(id))
        )
      related = this.sortByDateDesc(pool)
        .slice(0, 3)
        .map((p: any) => this.localizePost(p, loc))
    }

    return {
      ...this.localizePost(post, loc, { full: true }),
      author: this.authorSummary(authors[0], loc),
      categories: cats.map((c: any) => this.categorySummary(c, loc)),
      tags: tags.map((t: any) => this.tagSummary(t, loc)),
      related,
    }
  }

  /** Danh mục cho bộ lọc storefront, đã bản-địa-hoá và sắp theo rank. */
  async listPublicCategories(locale: string) {
    const loc = locale || BLOG_DEFAULT_LOCALE
    const cats = await this.listBlogCategories({})
    return [...cats]
      .sort((a: any, b: any) => (a.rank ?? 0) - (b.rank ?? 0))
      .map((c: any) => this.categorySummary(c, loc))
  }
}

export default BlogModuleService
