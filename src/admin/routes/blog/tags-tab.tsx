import { Button, Drawer, Input, Text, toast } from "@medusajs/ui"
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

/* ═══════ Tab Thẻ — có `name` đa ngôn ngữ + slug ═══════ */

type Tag = { id: string; slug: string; name: LocaleMap | null }
type TagBody = { slug: string; name: LocaleMap }

const TagForm = ({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial: Tag | null
  saving?: boolean
  onSave: (body: TagBody) => void
  onCancel: () => void
}) => {
  const locales = useLocales()
  const [slug, setSlug] = useState(initial?.slug ?? "")
  const [name, setName] = useState<LocaleMap>(() => ({ ...(initial?.name ?? {}) }))

  const submit = () => {
    if (!slug.trim()) {
      toast.error("Thiếu slug", { description: "Thẻ cần có slug." })
      return
    }
    onSave({ slug: slug.trim(), name: collectLocaleMap(locales, name) })
  }

  return (
    <div className="flex flex-col gap-4 px-6 py-4">
      <Field label="Slug" hint="Chữ thường không dấu, số và dấu gạch ngang.">
        <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
      </Field>
      <LocaleGroups locales={locales}>
        {(code) => (
          <Field label="Tên">
            <Input
              value={name[code] ?? ""}
              onChange={(e) =>
                setName((p) => ({ ...p, [code]: e.target.value }))
              }
            />
          </Field>
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

const TagsTab = () => {
  const queryClient = useQueryClient()
  const locales = useLocales()
  const firstLocale = locales[0]?.code
  const [editing, setEditing] = useState<Tag | null | undefined>(undefined)

  const { data, isLoading } = useQuery({
    queryKey: ["blog-tags"],
    queryFn: () =>
      sdk.client.fetch<{ tags: Tag[]; count: number }>("/admin/blog/tags"),
  })
  const tags = data?.tags ?? []
  const close = () => setEditing(undefined)

  const create = useMutation({
    mutationFn: (body: TagBody) =>
      sdk.client.fetch("/admin/blog/tags", { method: "POST", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blog-tags"] })
      close()
      toast.success("Đã tạo thẻ")
    },
    onError: fail,
  })
  const update = useMutation({
    mutationFn: (v: { id: string; body: TagBody }) =>
      sdk.client.fetch(`/admin/blog/tags/${v.id}`, {
        method: "POST",
        body: v.body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blog-tags"] })
      close()
      toast.success("Đã lưu thẻ")
    },
    onError: fail,
  })
  const remove = useMutation({
    mutationFn: (id: string) =>
      sdk.client.fetch(`/admin/blog/tags/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blog-tags"] })
      toast.success("Đã xoá thẻ")
    },
    onError: fail,
  })

  const saving = create.isPending || update.isPending
  const onSave = (body: TagBody) => {
    if (editing) {
      update.mutate({ id: editing.id, body })
    } else {
      create.mutate(body)
    }
  }
  const nameOf = (t: Tag) => (firstLocale && t.name?.[firstLocale]) || ""

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-6 py-4">
        <Text weight="plus">Thẻ</Text>
        <Button size="small" onClick={() => setEditing(null)}>
          Thẻ mới
        </Button>
      </div>

      {isLoading && (
        <div className="px-6 pb-6">
          <Text className="text-ui-fg-subtle">Đang tải…</Text>
        </div>
      )}
      {!isLoading && tags.length === 0 && (
        <div className="px-6 pb-6">
          <Text className="text-ui-fg-subtle">Chưa có thẻ nào.</Text>
        </div>
      )}
      {!isLoading && tags.length > 0 && (
        <div className="px-6 pb-6">
          <table className="w-full text-left text-sm">
            <thead className="text-ui-fg-subtle">
              <tr className="border-ui-border-base border-b">
                <th className="py-2 pr-4 font-medium">Tên</th>
                <th className="py-2 pr-4 font-medium">Slug</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {tags.map((t) => (
                <tr key={t.id} className="border-ui-border-base border-b">
                  <td className="py-3 pr-4">
                    {nameOf(t) ? (
                      <Text size="small">{nameOf(t)}</Text>
                    ) : (
                      <Text size="small" className="text-ui-fg-muted">
                        (Chưa đặt tên)
                      </Text>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <Text size="small" className="text-ui-fg-subtle">
                      {t.slug}
                    </Text>
                  </td>
                  <td className="py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => setEditing(t)}
                      >
                        Sửa
                      </Button>
                      <Button
                        variant="danger"
                        size="small"
                        onClick={() => {
                          if (confirm(`Xoá thẻ "${nameOf(t) || t.slug}"?`)) {
                            remove.mutate(t.id)
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
            <Drawer.Title>{editing ? "Sửa thẻ" : "Thẻ mới"}</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="overflow-y-auto p-0">
            {editing !== undefined && (
              <TagForm
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

export default TagsTab
