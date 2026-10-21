import { Button, Input, Select, Switch, Text, Textarea, toast } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"
import {
  Field,
  LocaleGroups,
  collectLocaleMap,
  useLocales,
  type LocaleMap,
} from "./blog-common"

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  FORM BÀI VIẾT (mở trong Drawer)
 * ═══════════════════════════════════════════════════════════════════════
 *  • Trường KHÔNG đa ngôn ngữ: slug, trạng thái, ngày đăng, ảnh, tác giả,
 *    nổi bật, danh mục (checkbox), thẻ (checkbox).
 *  • Trường ĐA NGÔN NGỮ: lặp theo GET /admin/blog/locales — mỗi locale có
 *    tiêu đề, mô tả ngắn, nội dung (Markdown), SEO tiêu đề, SEO mô tả.
 *  Gửi TRỌN map cho mọi locale đang bật.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type BlogPost = {
  id: string
  slug: string
  status: "draft" | "published"
  published_at: string | null
  thumbnail: string | null
  author_id: string | null
  category_ids: string[] | null
  tag_ids: string[] | null
  is_featured: boolean
  title: LocaleMap | null
  excerpt: LocaleMap | null
  content: LocaleMap | null
  seo_title: LocaleMap | null
  seo_description: LocaleMap | null
}

export type PostFormValues = {
  slug: string
  status: "draft" | "published"
  published_at: string | null
  thumbnail: string | null
  author_id: string | null
  category_ids: string[]
  tag_ids: string[]
  is_featured: boolean
  title: LocaleMap
  excerpt: LocaleMap
  content: LocaleMap
  seo_title: LocaleMap
  seo_description: LocaleMap
}

type Author = { id: string; name: string }
type Category = { id: string; slug: string; name: LocaleMap | null }
type Tag = { id: string; slug: string; name: LocaleMap | null }

// Radix Select CẤM value = "" → dùng sentinel này cho "không chọn tác giả".
const NO_AUTHOR = "__none__"

/** ISO string → giá trị cho <input type="datetime-local"> (giờ địa phương). */
const toLocalInput = (iso: string | null): string => {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
    d.getHours()
  )}:${p(d.getMinutes())}`
}

type Props = {
  initialPost: BlogPost | null
  saving?: boolean
  onSave: (values: PostFormValues) => void
  onCancel: () => void
}

const PostForm = ({ initialPost, saving, onSave, onCancel }: Props) => {
  const locales = useLocales()

  const { data: authorsData } = useQuery({
    queryKey: ["blog-authors"],
    queryFn: () =>
      sdk.client.fetch<{ authors: Author[] }>("/admin/blog/authors"),
  })
  const { data: categoriesData } = useQuery({
    queryKey: ["blog-categories"],
    queryFn: () =>
      sdk.client.fetch<{ categories: Category[] }>("/admin/blog/categories"),
  })
  const { data: tagsData } = useQuery({
    queryKey: ["blog-tags"],
    queryFn: () => sdk.client.fetch<{ tags: Tag[] }>("/admin/blog/tags"),
  })

  const authors = authorsData?.authors ?? []
  const categories = categoriesData?.categories ?? []
  const tags = tagsData?.tags ?? []

  // ── Trường KHÔNG đa ngôn ngữ ──
  const [slug, setSlug] = useState(initialPost?.slug ?? "")
  const [status, setStatus] = useState<"draft" | "published">(
    initialPost?.status ?? "draft"
  )
  const [publishedAt, setPublishedAt] = useState(
    toLocalInput(initialPost?.published_at ?? null)
  )
  const [thumbnail, setThumbnail] = useState(initialPost?.thumbnail ?? "")
  const [authorId, setAuthorId] = useState(initialPost?.author_id ?? NO_AUTHOR)
  const [isFeatured, setIsFeatured] = useState(Boolean(initialPost?.is_featured))
  const [categoryIds, setCategoryIds] = useState<string[]>(
    initialPost?.category_ids ?? []
  )
  const [tagIds, setTagIds] = useState<string[]>(initialPost?.tag_ids ?? [])

  // ── Trường ĐA NGÔN NGỮ (map theo mã locale, seed từ bài đang sửa) ──
  const [title, setTitle] = useState<LocaleMap>(() => ({
    ...(initialPost?.title ?? {}),
  }))
  const [excerpt, setExcerpt] = useState<LocaleMap>(() => ({
    ...(initialPost?.excerpt ?? {}),
  }))
  const [content, setContent] = useState<LocaleMap>(() => ({
    ...(initialPost?.content ?? {}),
  }))
  const [seoTitle, setSeoTitle] = useState<LocaleMap>(() => ({
    ...(initialPost?.seo_title ?? {}),
  }))
  const [seoDescription, setSeoDescription] = useState<LocaleMap>(() => ({
    ...(initialPost?.seo_description ?? {}),
  }))

  const toggle = (list: string[], id: string, set: (v: string[]) => void) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const submit = () => {
    if (!slug.trim()) {
      toast.error("Thiếu slug", { description: "Bài viết cần có slug." })
      return
    }
    onSave({
      slug: slug.trim(),
      status,
      published_at: publishedAt ? new Date(publishedAt).toISOString() : null,
      thumbnail: thumbnail.trim() === "" ? null : thumbnail.trim(),
      author_id: authorId === NO_AUTHOR ? null : authorId,
      category_ids: categoryIds,
      tag_ids: tagIds,
      is_featured: isFeatured,
      title: collectLocaleMap(locales, title),
      excerpt: collectLocaleMap(locales, excerpt),
      content: collectLocaleMap(locales, content),
      seo_title: collectLocaleMap(locales, seoTitle),
      seo_description: collectLocaleMap(locales, seoDescription),
    })
  }

  const labelOf = (m: LocaleMap | null, slugFallback: string) =>
    (locales[0] && m?.[locales[0].code]) || slugFallback

  return (
    <div className="flex flex-col gap-5 px-6 py-4">
      {/* ── Thông tin chung ── */}
      <div className="flex flex-col gap-3">
        <Field label="Slug" hint="Chữ thường không dấu, số và dấu gạch ngang.">
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="vi-du-bai-viet"
          />
        </Field>

        <Field label="Trạng thái">
          <Select
            value={status}
            onValueChange={(v: string) => setStatus(v as "draft" | "published")}
          >
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="draft">Bản nháp</Select.Item>
              <Select.Item value="published">Đang hiện</Select.Item>
            </Select.Content>
          </Select>
        </Field>

        <Field
          label="Ngày đăng"
          hint="Để trống: khi xuất bản sẽ tự lấy thời điểm hiện tại."
        >
          <Input
            type="datetime-local"
            value={publishedAt}
            onChange={(e) => setPublishedAt(e.target.value)}
          />
        </Field>

        <Field label="Ảnh đại diện (URL)">
          <Input
            value={thumbnail}
            onChange={(e) => setThumbnail(e.target.value)}
            placeholder="https://…"
          />
        </Field>

        <Field label="Tác giả">
          <Select value={authorId} onValueChange={setAuthorId}>
            <Select.Trigger>
              <Select.Value placeholder="Chọn tác giả…" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value={NO_AUTHOR}>— Không chọn —</Select.Item>
              {authors.map((a) => (
                <Select.Item key={a.id} value={a.id}>
                  {a.name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </Field>

        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <Text size="small" weight="plus">
              Bài nổi bật
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              Ghim ở vị trí nổi bật trên trang blog.
            </Text>
          </div>
          <Switch
            checked={isFeatured}
            onCheckedChange={(c: boolean) => setIsFeatured(c)}
          />
        </div>
      </div>

      {/* ── Danh mục ── */}
      <div className="flex flex-col gap-2">
        <Text size="small" weight="plus">
          Danh mục
        </Text>
        {categories.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle">
            Chưa có danh mục nào.
          </Text>
        ) : (
          <div className="flex flex-col gap-2">
            {categories.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-2"
              >
                <input
                  type="checkbox"
                  checked={categoryIds.includes(c.id)}
                  onChange={() => toggle(categoryIds, c.id, setCategoryIds)}
                />
                <Text size="small">{labelOf(c.name, c.slug)}</Text>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* ── Thẻ ── */}
      <div className="flex flex-col gap-2">
        <Text size="small" weight="plus">
          Thẻ
        </Text>
        {tags.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle">
            Chưa có thẻ nào.
          </Text>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {tags.map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer items-center gap-2"
              >
                <input
                  type="checkbox"
                  checked={tagIds.includes(t.id)}
                  onChange={() => toggle(tagIds, t.id, setTagIds)}
                />
                <Text size="small">{labelOf(t.name, t.slug)}</Text>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* ── Nội dung theo từng ngôn ngữ ── */}
      <div className="flex flex-col gap-2">
        <Text size="small" weight="plus">
          Nội dung theo ngôn ngữ
        </Text>
        <LocaleGroups locales={locales}>
          {(code) => (
            <>
              <Field label="Tiêu đề">
                <Input
                  value={title[code] ?? ""}
                  onChange={(e) =>
                    setTitle((p) => ({ ...p, [code]: e.target.value }))
                  }
                />
              </Field>
              <Field label="Mô tả ngắn">
                <Textarea
                  value={excerpt[code] ?? ""}
                  onChange={(e) =>
                    setExcerpt((p) => ({ ...p, [code]: e.target.value }))
                  }
                  rows={3}
                />
              </Field>
              <Field label="Nội dung" hint="Hỗ trợ Markdown.">
                <Textarea
                  value={content[code] ?? ""}
                  onChange={(e) =>
                    setContent((p) => ({ ...p, [code]: e.target.value }))
                  }
                  rows={10}
                />
              </Field>
              <Field label="SEO — Tiêu đề">
                <Input
                  value={seoTitle[code] ?? ""}
                  onChange={(e) =>
                    setSeoTitle((p) => ({ ...p, [code]: e.target.value }))
                  }
                />
              </Field>
              <Field label="SEO — Mô tả">
                <Textarea
                  value={seoDescription[code] ?? ""}
                  onChange={(e) =>
                    setSeoDescription((p) => ({ ...p, [code]: e.target.value }))
                  }
                  rows={3}
                />
              </Field>
            </>
          )}
        </LocaleGroups>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Huỷ
        </Button>
        <Button onClick={submit} isLoading={saving}>
          Lưu
        </Button>
      </div>
    </div>
  )
}

export default PostForm
