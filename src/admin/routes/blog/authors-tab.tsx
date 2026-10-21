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

/* ═══ Tab Tác giả — `name` là chuỗi THƯỜNG (không dịch), `bio` đa ngôn ngữ ═══ */

type Author = {
  id: string
  name: string
  bio: LocaleMap | null
  avatar: string | null
}

type AuthorBody = { name: string; avatar: string | null; bio: LocaleMap }

const AuthorForm = ({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial: Author | null
  saving?: boolean
  onSave: (body: AuthorBody) => void
  onCancel: () => void
}) => {
  const locales = useLocales()
  const [name, setName] = useState(initial?.name ?? "")
  const [avatar, setAvatar] = useState(initial?.avatar ?? "")
  const [bio, setBio] = useState<LocaleMap>(() => ({ ...(initial?.bio ?? {}) }))

  const submit = () => {
    if (!name.trim()) {
      toast.error("Thiếu tên", { description: "Tác giả cần có tên." })
      return
    }
    onSave({
      name: name.trim(),
      avatar: avatar.trim() === "" ? null : avatar.trim(),
      bio: collectLocaleMap(locales, bio),
    })
  }

  return (
    <div className="flex flex-col gap-4 px-6 py-4">
      <Field label="Tên" hint="Hiển thị chung, không dịch theo ngôn ngữ.">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Ảnh đại diện (URL)">
        <Input
          value={avatar}
          onChange={(e) => setAvatar(e.target.value)}
          placeholder="https://…"
        />
      </Field>
      <LocaleGroups locales={locales}>
        {(code) => (
          <Field label="Giới thiệu">
            <Textarea
              value={bio[code] ?? ""}
              onChange={(e) => setBio((p) => ({ ...p, [code]: e.target.value }))}
              rows={4}
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

const AuthorsTab = () => {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Author | null | undefined>(undefined)

  const { data, isLoading } = useQuery({
    queryKey: ["blog-authors"],
    queryFn: () =>
      sdk.client.fetch<{ authors: Author[]; count: number }>(
        "/admin/blog/authors"
      ),
  })
  const authors = data?.authors ?? []
  const close = () => setEditing(undefined)

  const create = useMutation({
    mutationFn: (body: AuthorBody) =>
      sdk.client.fetch("/admin/blog/authors", { method: "POST", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blog-authors"] })
      close()
      toast.success("Đã tạo tác giả")
    },
    onError: fail,
  })
  const update = useMutation({
    mutationFn: (v: { id: string; body: AuthorBody }) =>
      sdk.client.fetch(`/admin/blog/authors/${v.id}`, {
        method: "POST",
        body: v.body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blog-authors"] })
      close()
      toast.success("Đã lưu tác giả")
    },
    onError: fail,
  })
  const remove = useMutation({
    mutationFn: (id: string) =>
      sdk.client.fetch(`/admin/blog/authors/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blog-authors"] })
      toast.success("Đã xoá tác giả")
    },
    onError: fail,
  })

  const saving = create.isPending || update.isPending
  const onSave = (body: AuthorBody) => {
    if (editing) {
      update.mutate({ id: editing.id, body })
    } else {
      create.mutate(body)
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-6 py-4">
        <Text weight="plus">Tác giả</Text>
        <Button size="small" onClick={() => setEditing(null)}>
          Tác giả mới
        </Button>
      </div>

      {isLoading && (
        <div className="px-6 pb-6">
          <Text className="text-ui-fg-subtle">Đang tải…</Text>
        </div>
      )}
      {!isLoading && authors.length === 0 && (
        <div className="px-6 pb-6">
          <Text className="text-ui-fg-subtle">Chưa có tác giả nào.</Text>
        </div>
      )}
      {!isLoading && authors.length > 0 && (
        <div className="px-6 pb-6">
          <table className="w-full text-left text-sm">
            <thead className="text-ui-fg-subtle">
              <tr className="border-ui-border-base border-b">
                <th className="py-2 pr-4 font-medium">Tên</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {authors.map((a) => (
                <tr key={a.id} className="border-ui-border-base border-b">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      {a.avatar && (
                        <img
                          src={a.avatar}
                          alt=""
                          className="h-6 w-6 rounded-full object-cover"
                        />
                      )}
                      <Text size="small">{a.name}</Text>
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => setEditing(a)}
                      >
                        Sửa
                      </Button>
                      <Button
                        variant="danger"
                        size="small"
                        onClick={() => {
                          if (confirm(`Xoá tác giả "${a.name}"?`)) {
                            remove.mutate(a.id)
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
              {editing ? "Sửa tác giả" : "Tác giả mới"}
            </Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="overflow-y-auto p-0">
            {editing !== undefined && (
              <AuthorForm
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

export default AuthorsTab
