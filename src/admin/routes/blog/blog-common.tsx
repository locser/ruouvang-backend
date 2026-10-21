import { Badge, Label, Text, toast } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { sdk } from "../../lib/sdk"

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  BLOG — tiện ích dùng chung cho các tab
 * ═══════════════════════════════════════════════════════════════════════
 *  ⚠️ RÀNG BUỘC Medusa Admin (giống page-builder):
 *   • Mọi component PHẢI là arrow function.
 *   • KHÔNG cài thêm @tanstack/react-query / @medusajs/ui — đã đi kèm sẵn.
 *
 *  Trường ĐA NGÔN NGỮ là map { [mã locale]: string }. Ta luôn gửi TRỌN VẸN
 *  map cho MỌI locale đang bật; ô trống gửi "" (backend đổi "" → null).
 * ═══════════════════════════════════════════════════════════════════════
 */

export type LocaleMap = Record<string, string>
export type Locale = { code: string; name: string }

/** Danh sách locale đang bật — nguồn để dựng các ô nhập theo ngôn ngữ. */
export const useLocales = (): Locale[] => {
  const { data } = useQuery({
    queryKey: ["blog-locales"],
    queryFn: () =>
      sdk.client.fetch<{ locales: Locale[] }>("/admin/blog/locales"),
  })
  return data?.locales ?? []
}

/** Gom TRỌN map cho MỌI locale đang bật (ô chưa nhập → ""). */
export const collectLocaleMap = (
  locales: Locale[],
  state: LocaleMap
): LocaleMap => {
  const out: LocaleMap = {}
  for (const l of locales) {
    out[l.code] = state[l.code] ?? ""
  }
  return out
}

/** Thông báo lỗi thống nhất cho mọi mutation. */
export const fail = (e: any) =>
  toast.error("Không thực hiện được", {
    description: e?.message ?? "Lỗi không rõ",
  })

/** Một ô nhập kèm nhãn (và gợi ý tuỳ chọn). */
export const Field = ({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) => (
  <div className="flex flex-col gap-1">
    <Label size="small" weight="plus">
      {label}
    </Label>
    {children}
    {hint && (
      <Text size="small" className="text-ui-fg-muted">
        {hint}
      </Text>
    )}
  </div>
)

/**
 * Lặp qua từng locale đang bật; mỗi locale là một nhóm có tiêu đề là tên
 * ngôn ngữ. `children` nhận mã locale và trả về các ô nhập của locale đó.
 */
export const LocaleGroups = ({
  locales,
  children,
}: {
  locales: Locale[]
  children: (code: string) => ReactNode
}) => {
  if (!locales.length) {
    return (
      <Text size="small" className="text-ui-fg-subtle">
        Chưa bật ngôn ngữ nào. Chạy script setup-locales để thêm ngôn ngữ.
      </Text>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {locales.map((l) => (
        <div
          key={l.code}
          className="rounded-lg border border-ui-border-base p-3"
        >
          <div className="mb-3 flex items-center gap-2">
            <Text weight="plus" size="small">
              {l.name}
            </Text>
            <Badge size="2xsmall">{l.code}</Badge>
          </div>
          <div className="flex flex-col gap-3">{children(l.code)}</div>
        </div>
      ))}
    </div>
  )
}
