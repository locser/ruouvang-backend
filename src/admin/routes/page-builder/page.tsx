import { useTranslation } from "react-i18next"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { SquaresPlus } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Select,
  Switch,
  Text,
  Drawer,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"
import SectionForm, { SectionSchema } from "./section-form"

type PageSection = {
  id: string
  type: string
  position: number
  enabled: boolean
  settings: Record<string, any> | null
}

type PageTemplate = {
  id: string
  handle: string
  title: string
  status: "draft" | "published"
  sections?: PageSection[]
}

const PageBuilderPage = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [editing, setEditing] = useState<PageSection | null>(null)
  const [addType, setAddType] = useState<string>("")

  // ───────────────────────────────────────────── Lấy dữ liệu ─────────
  const { data: list } = useQuery({
    queryKey: ["page-templates"],
    queryFn: () =>
      sdk.client.fetch<{ page_templates: PageTemplate[] }>(
        "/admin/page-builder/templates"
      ),
  })

  const templates = list?.page_templates ?? []
  const currentId = templateId ?? templates[0]?.id ?? null

  const { data: detail, isLoading } = useQuery({
    queryKey: ["page-template", currentId],
    queryFn: () =>
      sdk.client.fetch<{ page_template: PageTemplate }>(
        `/admin/page-builder/templates/${currentId}`
      ),
    enabled: !!currentId,
  })

  // Lược đồ — nguồn để dựng form. Thêm khối ở backend là ở đây tự có.
  const { data: schemaData } = useQuery({
    queryKey: ["section-schemas"],
    queryFn: () =>
      sdk.client.fetch<{ section_schemas: SectionSchema[] }>(
        "/admin/page-builder/schemas"
      ),
  })

  const page = detail?.page_template
  const sections = page?.sections ?? []
  const schemas = schemaData?.section_schemas ?? []

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["page-template", currentId] })
  }

  const fail = (e: any) =>
    toast.error("Không thực hiện được", {
      description: e?.message ?? "Lỗi không rõ",
    })

  // ───────────────────────────────────────────── Thao tác ────────────
  const toggle = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) =>
      sdk.client.fetch(`/admin/page-builder/sections/${v.id}`, {
        method: "POST",
        body: { enabled: v.enabled },
      }),
    onSuccess: refresh,
    onError: fail,
  })

  const reorder = useMutation({
    mutationFn: (ids: string[]) =>
      sdk.client.fetch(`/admin/page-builder/templates/${currentId}/reorder`, {
        method: "POST",
        body: { section_ids: ids },
      }),
    onSuccess: refresh,
    onError: fail,
  })

  const addSection = useMutation({
    mutationFn: (type: string) =>
      sdk.client.fetch(`/admin/page-builder/templates/${currentId}/sections`, {
        method: "POST",
        body: { type },
      }),
    onSuccess: () => {
      setAddType("")
      refresh()
      toast.success("Đã thêm khối")
    },
    onError: fail,
  })

  const removeSection = useMutation({
    mutationFn: (id: string) =>
      sdk.client.fetch(`/admin/page-builder/sections/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      refresh()
      toast.success("Đã xoá khối")
    },
    onError: fail,
  })

  const saveSettings = useMutation({
    mutationFn: (v: { id: string; settings: Record<string, any> }) =>
      sdk.client.fetch(`/admin/page-builder/sections/${v.id}`, {
        method: "POST",
        body: { settings: v.settings },
      }),
    onSuccess: () => {
      setEditing(null)
      refresh()
      toast.success("Đã lưu")
    },
    onError: fail,
  })

  /** Đổi chỗ 2 khối rồi gửi TRỌN danh sách id — backend đòi gửi đủ. */
  const move = (index: number, dir: -1 | 1) => {
    const next = index + dir
    if (next < 0 || next >= sections.length) return
    const ids = sections.map((s) => s.id)
    ;[ids[index], ids[next]] = [ids[next], ids[index]]
    reorder.mutate(ids)
  }

  const schemaOf = (type: string) => schemas.find((s) => s.type === type)

  // ───────────────────────────────────────────── Giao diện ───────────
  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h2">Trình dựng trang</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Bật/tắt, sắp xếp và sửa nội dung từng khối. Lưu là storefront đổi ngay.
          </Text>
        </div>

        {templates.length > 1 && (
          <Select value={currentId ?? ""} onValueChange={setTemplateId}>
            <Select.Trigger className="w-56">
              <Select.Value placeholder="Chọn trang" />
            </Select.Trigger>
            <Select.Content>
              {templates.map((t) => (
                <Select.Item key={t.id} value={t.id}>
                  {t.title}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        )}
      </div>

      {isLoading && (
        <div className="px-6 py-8">
          <Text className="text-ui-fg-subtle">Đang tải…</Text>
        </div>
      )}

      {!isLoading && !templates.length && (
        <div className="px-6 py-8">
          <Text className="text-ui-fg-subtle">
            Chưa có trang nào. Chạy lệnh seed để tạo trang chủ mặc định:
          </Text>
          <Text size="small" className="mt-2 font-mono text-ui-fg-muted">
            npx medusa exec ./src/scripts/seed-pages.ts
          </Text>
        </div>
      )}

      {page && (
        <>
          <div className="flex items-center gap-2 px-6 py-3">
            <Text size="small" className="text-ui-fg-subtle">
              /{page.handle}
            </Text>
            <Badge
              size="2xsmall"
              color={page.status === "published" ? "green" : "grey"}
            >
              {page.status === "published" ? "Đang hiện" : "Bản nháp"}
            </Badge>
          </div>

          {/* ───────────── Danh sách khối ───────────── */}
          <div className="flex flex-col divide-y">
            {sections.map((s, i) => {
              const schema = schemaOf(s.type)
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-4 px-6 py-4"
                  style={{ opacity: s.enabled ? 1 : 0.5 }}
                >
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="transparent"
                      size="small"
                      disabled={i === 0 || reorder.isPending}
                      onClick={() => move(i, -1)}
                      aria-label="Đưa lên trên"
                    >
                      ↑
                    </Button>
                    <Button
                      variant="transparent"
                      size="small"
                      disabled={i === sections.length - 1 || reorder.isPending}
                      onClick={() => move(i, 1)}
                      aria-label="Đưa xuống dưới"
                    >
                      ↓
                    </Button>
                  </div>

                  <div className="flex-1">
                    <Text weight="plus">{schema?.name ?? s.type}</Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      {schema?.description ?? (
                        <span className="text-ui-fg-error">
                          ⚠️ Khối "{s.type}" không có trong lược đồ — storefront sẽ bỏ qua
                        </span>
                      )}
                    </Text>
                  </div>

                  <Switch
                    checked={s.enabled}
                    onCheckedChange={(c: boolean) =>
                      toggle.mutate({ id: s.id, enabled: c })
                    }
                  />

                  <Button
                    variant="secondary"
                    size="small"
                    disabled={!schema}
                    onClick={() => setEditing(s)}
                  >
                    Sửa
                  </Button>

                  <Button
                    variant="danger"
                    size="small"
                    onClick={() => {
                      if (confirm(`Xoá hẳn khối "${schema?.name ?? s.type}"?`)) {
                        removeSection.mutate(s.id)
                      }
                    }}
                  >
                    Xoá
                  </Button>
                </div>
              )
            })}
          </div>

          {/* ───────────── Thêm khối ───────────── */}
          <div className="flex items-center gap-2 px-6 py-4">
            <Select value={addType} onValueChange={setAddType}>
              <Select.Trigger className="w-72">
                <Select.Value placeholder="Chọn khối muốn thêm…" />
              </Select.Trigger>
              <Select.Content>
                {schemas.map((s) => (
                  <Select.Item key={s.type} value={s.type}>
                    {s.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
            <Button
              disabled={!addType}
              isLoading={addSection.isPending}
              onClick={() => addSection.mutate(addType)}
            >
              Thêm khối
            </Button>
          </div>
        </>
      )}

      {/* ───────────── Ngăn sửa nội dung — form TỰ SINH từ lược đồ ───────────── */}
      <Drawer open={!!editing} onOpenChange={(o: boolean) => !o && setEditing(null)}>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>
              {editing ? schemaOf(editing.type)?.name ?? editing.type : ""}
            </Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="overflow-y-auto p-0">
            {editing && schemaOf(editing.type) && (
              <SectionForm
                schema={schemaOf(editing.type)!}
                initial={editing.settings ?? {}}
                saving={saveSettings.isPending}
                onCancel={() => setEditing(null)}
                onSave={(settings) =>
                  saveSettings.mutate({ id: editing.id, settings })
                }
              />
            )}
          </Drawer.Body>
        </Drawer.Content>
      </Drawer>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Trình dựng trang",
  icon: SquaresPlus,
})

export default PageBuilderPage
