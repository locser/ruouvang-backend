import { Button, Input, Label, Select, Switch, Text, Textarea } from "@medusajs/ui"
import { useState } from "react"

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  FORM TỰ SINH TỪ LƯỢC ĐỒ (Schema-driven form)
 * ═══════════════════════════════════════════════════════════════════════
 *  Component này KHÔNG biết gì về khối cụ thể nào. Nó đọc lược đồ và vẽ
 *  ô nhập tương ứng.
 *
 *  ⇒ Thêm khối mới ở backend (section-schemas.ts) = form ở đây TỰ CÓ,
 *    không sửa một dòng nào tại file này. Đây là toàn bộ lý do chọn
 *    kiến trúc theo lược đồ, học từ Shopify.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type SectionSetting = {
  id: string
  type: string
  label: string
  info?: string
  default?: string | number | boolean | null
  options?: { value: string; label: string }[]
  translatable?: boolean
}

export type SectionSchema = {
  type: string
  name: string
  description: string
  settings: SectionSetting[]
  limit?: number | null
}

type Props = {
  schema: SectionSchema
  initial: Record<string, any>
  saving?: boolean
  onSave: (settings: Record<string, any>) => void
  onCancel: () => void
}

const SectionForm = ({ schema, initial, saving, onSave, onCancel }: Props) => {
  const [values, setValues] = useState<Record<string, any>>(() => {
    // Dựng giá trị ban đầu từ lược đồ để ô nào cũng có mặt trong form,
    // kể cả ô backend chưa từng lưu (settings JSON thiếu khoá).
    const v: Record<string, any> = {}
    for (const s of schema.settings) {
      v[s.id] = initial?.[s.id] ?? (s.type === "boolean" ? false : "")
    }
    return v
  })

  const set = (id: string, val: any) =>
    setValues((prev) => ({ ...prev, [id]: val }))

  const submit = () => {
    // ⚠️ Gửi TRỌN VẸN object settings — không gửi từng phần.
    //    json() của Medusa merge chứ không thay thế.
    // ⚠️ Ô để trống → gửi null, KHÔNG gửi "".
    //    Medusa xoá hẳn khoá khỏi JSON khi nhận chuỗi rỗng.
    const out: Record<string, any> = {}
    for (const s of schema.settings) {
      const raw = values[s.id]
      if (s.type === "boolean") {
        out[s.id] = Boolean(raw)
      } else if (s.type === "number") {
        const n = Number(raw)
        out[s.id] = raw === "" || Number.isNaN(n) ? null : n
      } else {
        out[s.id] = typeof raw === "string" && raw.trim() === "" ? null : raw
      }
    }
    onSave(out)
  }

  return (
    <div className="flex flex-col gap-4 px-6 py-4">
      <Text className="text-ui-fg-subtle">{schema.description}</Text>

      {schema.settings.map((s) => (
        <div key={s.id} className="flex flex-col gap-1">
          <Label size="small" weight="plus">
            {s.label}
            {s.translatable && (
              <span
                className="ml-2 text-ui-fg-muted"
                title="Trường này dịch được sang ngôn ngữ khác qua Translation Module"
              >
                🌐
              </span>
            )}
          </Label>

          {s.type === "boolean" && (
            <Switch
              checked={Boolean(values[s.id])}
              onCheckedChange={(c: boolean) => set(s.id, c)}
            />
          )}

          {s.type === "textarea" && (
            <Textarea
              value={values[s.id] ?? ""}
              onChange={(e) => set(s.id, e.target.value)}
              rows={4}
            />
          )}

          {s.type === "select" && (
            <Select
              value={String(values[s.id] ?? "")}
              onValueChange={(v: string) => set(s.id, v)}
            >
              <Select.Trigger>
                <Select.Value placeholder="Chọn…" />
              </Select.Trigger>
              <Select.Content>
                {(s.options || []).map((o) => (
                  <Select.Item key={o.value} value={o.value}>
                    {o.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          )}

          {["text", "url", "image", "collection", "color", "number"].includes(
            s.type
          ) && (
            <Input
              type={s.type === "number" ? "number" : "text"}
              value={values[s.id] ?? ""}
              onChange={(e) => set(s.id, e.target.value)}
              placeholder={
                s.default != null && s.type !== "boolean"
                  ? `Mặc định: ${s.default}`
                  : undefined
              }
            />
          )}

          {s.info && (
            <Text size="small" className="text-ui-fg-muted">
              {s.info}
            </Text>
          )}
        </div>
      ))}

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

export default SectionForm
