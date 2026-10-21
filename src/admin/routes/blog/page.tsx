import { useTranslation } from "react-i18next"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { DocumentText } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Drawer,
  Heading,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"
import { fail, useLocales } from "./blog-common"
import AuthorsTab from "./authors-tab"
import CategoriesTab from "./categories-tab"
import PostForm, { type BlogPost, type PostFormValues } from "./post-form"
import TagsTab from "./tags-tab"

type Tab = "posts" | "categories" | "tags" | "authors"

const BlogPage = () => {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>("posts")

  const tabs: { id: Tab; label: string }[] = [
    { id: "posts", label: t("blog.tab_posts", "Bài viết") },
    { id: "categories", label: t("blog.tab_categories", "Danh mục") },
    { id: "tags", label: t("blog.tab_tags", "Thẻ") },
    { id: "authors", label: t("blog.tab_authors", "Tác giả") },
  ]

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("blog.title", "Quản lý Bài viết & Tin tức (Blog)")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("blog.description", "Quản lý bài viết, danh mục, thẻ và tác giả — hỗ trợ đa ngôn ngữ.")}
        </Text>
      </div>

      {/* Thanh tab */}
      <div className="flex flex-wrap gap-2 px-6 py-3">
        {tabs.map((tb) => (
          <Button
            key={tb.id}
            variant={tab === tb.id ? "primary" : "secondary"}
            size="small"
            onClick={() => setTab(tb.id)}
          >
            {tb.label}
          </Button>
        ))}
      </div>

      {tab === "posts" && <PostsTab />}
      {tab === "categories" && <CategoriesTab />}
      {tab === "tags" && <TagsTab />}
      {tab === "authors" && <AuthorsTab />}
    </Container>
  )
}

/* ─────────────────────────────── Tab Bài viết ─────────────────────────── */
const PostsTab = () => {
  const queryClient = useQueryClient()
  const locales = useLocales()
  const firstLocale = locales[0]?.code

  // undefined = đóng Drawer · null = tạo mới · string = đang sửa bài id đó
  const [editingId, setEditingId] = useState<string | null | undefined>(
    undefined
  )

  const { data, isLoading } = useQuery({
    queryKey: ["blog-posts"],
    queryFn: () =>
      sdk.client.fetch<{ posts: BlogPost[]; count: number }>(
        "/admin/blog/posts"
      ),
  })
  const posts = data?.posts ?? []

  // Lấy bài thô (đủ mọi locale) để sửa — chỉ chạy khi đang sửa.
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["blog-post", editingId],
    queryFn: () =>
      sdk.client.fetch<{ post: BlogPost }>(`/admin/blog/posts/${editingId}`),
    enabled: typeof editingId === "string",
  })

  const close = () => setEditingId(undefined)

  const createPost = useMutation({
    mutationFn: (body: PostFormValues) =>
      sdk.client.fetch("/admin/blog/posts", { method: "POST", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blog-posts"] })
      close()
      toast.success("Đã tạo bài viết")
    },
    onError: fail,
  })

  const updatePost = useMutation({
    mutationFn: (v: { id: string; body: PostFormValues }) =>
      sdk.client.fetch(`/admin/blog/posts/${v.id}`, {
        method: "POST",
        body: v.body,
      }),
    onSuccess: (_res, v) => {
      queryClient.invalidateQueries({ queryKey: ["blog-posts"] })
      queryClient.invalidateQueries({ queryKey: ["blog-post", v.id] })
      close()
      toast.success("Đã lưu bài viết")
    },
    onError: fail,
  })

  const deletePost = useMutation({
    mutationFn: (id: string) =>
      sdk.client.fetch(`/admin/blog/posts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blog-posts"] })
      toast.success("Đã xoá bài viết")
    },
    onError: fail,
  })

  const saving = createPost.isPending || updatePost.isPending

  const onSave = (values: PostFormValues) => {
    if (typeof editingId === "string") {
      updatePost.mutate({ id: editingId, body: values })
    } else {
      createPost.mutate(values)
    }
  }

  const titleOf = (p: BlogPost) => (firstLocale && p.title?.[firstLocale]) || ""

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-6 py-4">
        <Text weight="plus">Bài viết</Text>
        <Button size="small" onClick={() => setEditingId(null)}>
          Bài viết mới
        </Button>
      </div>

      {isLoading && (
        <div className="px-6 pb-6">
          <Text className="text-ui-fg-subtle">Đang tải…</Text>
        </div>
      )}

      {!isLoading && posts.length === 0 && (
        <div className="px-6 pb-6">
          <Text className="text-ui-fg-subtle">Chưa có bài viết nào.</Text>
        </div>
      )}

      {!isLoading && posts.length > 0 && (
        <div className="px-6 pb-6">
          <table className="w-full text-left text-sm">
            <thead className="text-ui-fg-subtle">
              <tr className="border-ui-border-base border-b">
                <th className="py-2 pr-4 font-medium">Tiêu đề</th>
                <th className="py-2 pr-4 font-medium">Slug</th>
                <th className="py-2 pr-4 font-medium">Trạng thái</th>
                <th className="py-2 pr-4 font-medium">Ngày đăng</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id} className="border-ui-border-base border-b">
                  <td className="py-3 pr-4">
                    {titleOf(p) ? (
                      <Text size="small">{titleOf(p)}</Text>
                    ) : (
                      <Text size="small" className="text-ui-fg-muted">
                        (Chưa có tiêu đề)
                      </Text>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <Text size="small" className="text-ui-fg-subtle">
                      {p.slug}
                    </Text>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge
                      size="2xsmall"
                      color={p.status === "published" ? "green" : "grey"}
                    >
                      {p.status === "published" ? "Đang hiện" : "Bản nháp"}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4">
                    <Text size="small" className="text-ui-fg-subtle">
                      {p.published_at
                        ? new Date(p.published_at).toLocaleDateString("vi-VN")
                        : "—"}
                    </Text>
                  </td>
                  <td className="py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => setEditingId(p.id)}
                      >
                        Sửa
                      </Button>
                      <Button
                        variant="danger"
                        size="small"
                        onClick={() => {
                          if (confirm(`Xoá bài viết "${titleOf(p) || p.slug}"?`)) {
                            deletePost.mutate(p.id)
                          }
                        }}
                      >
                        Xoá
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer
        open={editingId !== undefined}
        onOpenChange={(o: boolean) => !o && close()}
      >
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>
              {typeof editingId === "string" ? "Sửa bài viết" : "Bài viết mới"}
            </Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="overflow-y-auto p-0">
            {editingId === null && (
              <PostForm
                initialPost={null}
                saving={saving}
                onCancel={close}
                onSave={onSave}
              />
            )}
            {typeof editingId === "string" &&
              (detailLoading ? (
                <div className="px-6 py-6">
                  <Text className="text-ui-fg-subtle">Đang tải…</Text>
                </div>
              ) : (
                <PostForm
                  key={editingId}
                  initialPost={detail?.post ?? null}
                  saving={saving}
                  onCancel={close}
                  onSave={onSave}
                />
              ))}
          </Drawer.Body>
        </Drawer.Content>
      </Drawer>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Blog",
  icon: DocumentText,
})

export default BlogPage
