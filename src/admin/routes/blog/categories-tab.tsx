import { Button, Drawer, Input, Text, Textarea, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"
import {
  Field,
  LocaleGroups,
  collectLocaleMap,
  fail,
  useLocales,
  type LocaleMap,
} from "./blog-common"

/* ═══ Tab Danh mục — có `name`/`description` đa ngôn ngữ + slug + thứ tự ═══ */

type Category = {
  id: string
  slug: string
  name: LocaleMap | null
  description: LocaleMap | null
  rank: number
}

type CategoryBody = {
  slug: string
  rank: number
  name: LocaleMap
  description: LocaleMap
}

const CategoryForm = ({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial: Category | null
  saving?: boolean
  onSave: (body: CategoryBody) => void
  onCancel: () => void
}) => {
  const locales = useLocales()
  const [slug, setSlug] = useState(initial?.slug ?? "")
  const [rank, setRank] = useState(String(initial?.rank ?? 0))
  const [name, setName] = useState<LocaleMap>(() => ({ ...(initial?.name ?? {}) }))
  const [description, setDescription] = useState<LocaleMap>(() => ({
    ...(initial?.description ?? {}),
  }))

  const submit = () => {
    if (!slug.trim()) {
      toast.error("Thiếu slug", { description: "Danh mục cần có slug." })
      return
    }
    const n = Number(rank)
    onSave({
      slug: slug.trim(),
      rank: Number.isNaN(n) ? 0 : n,
      name: collectLocaleMap(locales, name),
      description: collectLocaleMap(locales, description),
    })
  }

  return (
    <div className="flex flex-col gap-4 px-6 py-4">
      <Field label="Slug" hint="Chữ thường không dấu, số và dấu gạch ngang.">
        <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
      </Field>
      <Field label="Thứ tự" hint="Số nhỏ hiện trước.">
        <Input
          type="number"
          value={rank}
          onChange={(e) => setRank(e.target.value)}
        />
      </Field>
      <LocaleGroups locales={locales}>
        {(code) => (
          <>
            <Field label="Tên">
              <Input
                value={name[code] ?? ""}
                onChange={(e) =>
                  setName((p) => ({ ...p, [code]: e.target.value }))
                }
              />
            </Field>
            <Field label="Mô tả">
              <Textarea
                value={description[code] ?? ""}
                onChange={(e) =>
                  setDescription((p) => ({ ...p, [code]: e.target.value }))
                }
                rows={3}
              />
            </Field>
          </>
        )}
      </LocaleGroups>
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

const CategoriesTab = () => {
  const queryClient = useQueryClient()
  const locales = useLocales()
  const firstLocale = locales[0]?.code
  const [editing, setEditing] = useState<Category | null | undefined>(undefined)

  const { data, isLoading } = useQuery({
    queryKey: ["blog-categories"],
    queryFn: () =>
      sdk.client.fetch<{ categories: Category[]; count: number }>(
        "/admin/blog/categories"
      ),
  })
  const categories = data?.categories ?? []
  const close = () => setEditing(undefined)

  const create = useMutation({
    mutationFn: (body: CategoryBody) =>
      sdk.client.fetch("/admin/blog/categories", { method: "POST", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blog-categories"] })
      close()
      toast.success("Đã tạo danh mục")
    },
    onError: fail,
  })
  const update = useMutation({
    mutationFn: (v: { id: string; body: CategoryBody }) =>
      sdk.client.fetch(`/admin/blog/categories/${v.id}`, {
        method: "POST",
        body: v.body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blog-categories"] })
      close()
      toast.success("Đã lưu danh mục")
    },
    onError: fail,
  })
  const remove = useMutation({
    mutationFn: (id: string) =>
      sdk.client.fetch(`/admin/blog/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blog-categories"] })
      toast.success("Đã xoá danh mục")
    },
    onError: fail,
  })

  const saving = create.isPending || update.isPending
  const onSave = (body: CategoryBody) => {
    if (editing) {
      update.mutate({ id: editing.id, body })
    } else {
      create.mutate(body)
    }
  }
  const nameOf = (c: Category) => (firstLocale && c.name?.[firstLocale]) || ""

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-6 py-4">
        <Text weight="plus">Danh mục</Text>
        <Button size="small" onClick={() => setEditing(null)}>
          Danh mục mới
        </Button>
      </div>

      {isLoading && (
        <div className="px-6 pb-6">
          <Text className="text-ui-fg-subtle">Đang tải…</Text>
        </div>
      )}
      {!isLoading && categories.length === 0 && (
        <div className="px-6 pb-6">
          <Text className="text-ui-fg-subtle">Chưa có danh mục nào.</Text>
        </div>
      )}
      {!isLoading && categories.length > 0 && (
        <div className="px-6 pb-6">
          <table className="w-full text-left text-sm">
            <thead className="text-ui-fg-subtle">
              <tr className="border-ui-border-base border-b">
                <th className="py-2 pr-4 font-medium">Tên</th>
                <th className="py-2 pr-4 font-medium">Slug</th>
                <th className="py-2 pr-4 font-medium">Thứ tự</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-ui-border-base border-b">
                  <td className="py-3 pr-4">
                    {nameOf(c) ? (
                      <Text size="small">{nameOf(c)}</Text>
                    ) : (
                      <Text size="small" className="text-ui-fg-muted">
                        (Chưa đặt tên)
                      </Text>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <Text size="small" className="text-ui-fg-subtle">
                      {c.slug}
                    </Text>
                  </td>
                  <td className="py-3 pr-4">
                    <Text size="small" className="text-ui-fg-subtle">
                      {c.rank}
                    </Text>
                  </td>
                  <td className="py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => setEditing(c)}
                      >
                        Sửa
                      </Button>
                      <Button
                        variant="danger"
                        size="small"
                        onClick={() => {
                          if (confirm(`Xoá danh mục "${nameOf(c) || c.slug}"?`)) {
                            remove.mutate(c.id)
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
        open={editing !== undefined}
        onOpenChange={(o: boolean) => !o && close()}
      >
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>
              {editing ? "Sửa danh mục" : "Danh mục mới"}
            </Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="overflow-y-auto p-0">
            {editing !== undefined && (
              <CategoryForm
                key={editing?.id ?? "new"}
                initial={editing}
                saving={saving}
                onCancel={close}
                onSave={onSave}
              />
            )}
          </Drawer.Body>
        </Drawer.Content>
      </Drawer>
    </div>
  )
}

export default CategoriesTab
