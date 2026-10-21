import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CogSixToothSolid } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Input, Label, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { sdk } from "../../lib/sdk"

type Muc = {
  key: string
  mo_ta: string
  nhom: "lien_he" | "ngan_hang" | "van_chuyen" | "email"
  bi_mat: boolean
  mac_dinh: string
  value: string
  nguon: "db" | "mac_dinh" | "chua_dat"
}

const NHOM: { id: Muc["nhom"]; ten: string; ghiChu?: string }[] = [
  { id: "lien_he", ten: "Liên hệ", ghiChu: "Hiển thị công khai trên website (nút gọi, Zalo) và trong email." },
  { id: "ngan_hang", ten: "Ngân hàng", ghiChu: "Dùng cho trang chuyển khoản và mã VietQR. Hiển thị công khai." },
  { id: "van_chuyen", ten: "Vận chuyển" },
  {
    id: "email",
    ten: "Email gửi khách",
    ghiChu: "Dùng gửi xác nhận đơn hàng và đặt lại mật khẩu của khách. Mật khẩu được mã hoá khi lưu.",
  },
]

const NHAN: Record<string, string> = {
  hotline: "Hotline",
  zalo_phone: "Số Zalo",
  bank_name: "Tên ngân hàng",
  bank_account: "Số tài khoản",
  bank_account_name: "Chủ tài khoản",
  bank_bin: "Mã ngân hàng / BIN (VietQR)",
  shipping_provider: "Đơn vị vận chuyển mặc định",
  smtp_host: "Máy chủ SMTP",
  smtp_port: "Cổng SMTP",
  default_customer_email: "Email mặc định cho đơn chatbot không có email",
  smtp_user: "Tài khoản SMTP",
  smtp_pass: "Mật khẩu SMTP",
  smtp_from: "Người gửi (From)",
}

const loi = (e: any) => toast.error(e?.message ?? "Có lỗi xảy ra")

/** VietQR: ảnh xem trước từ img.vietqr.io, dùng mã BIN + số tài khoản. */
function urlVietQr(v: Record<string, string>): string | null {
  if (!/^[A-Za-z0-9]{2,12}$/.test(v.bank_bin ?? "") || !/^\d{3,20}$/.test(v.bank_account ?? "")) return null
  const ten = encodeURIComponent(v.bank_account_name ?? "")
  return `https://img.vietqr.io/image/${v.bank_bin}-${v.bank_account}-compact2.png?accountName=${ten}`
}

const CaiDatCuaHangPage = () => {
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => sdk.client.fetch<{ settings: Muc[] }>("/admin/app-settings"),
  })

  // Giá trị đang sửa. Khoá bí mật bắt đầu rỗng: để trống = giữ nguyên.
  const [form, setForm] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!data) return
    const f: Record<string, string> = {}
    for (const m of data.settings) {
      // Ô hiện giá trị đang lưu trong DB; nếu chưa đặt thì để trống (placeholder = mặc định).
      f[m.key] = m.bi_mat ? "" : m.nguon === "db" ? m.value : ""
    }
    setForm(f)
  }, [data])

  const luu = useMutation({
    mutationFn: (settings: Record<string, string>) =>
      sdk.client.fetch("/admin/app-settings", { method: "PUT", body: { settings } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app-settings"] })
      toast.success("Đã lưu cấu hình cửa hàng")
    },
    onError: loi,
  })

  if (isLoading) return <Container className="p-6"><Text>Đang tải...</Text></Container>
  if (error || !data) return <Container className="p-6"><Text>Không tải được cấu hình.</Text></Container>

  const mucTheoKhoa = new Map(data.settings.map((m) => [m.key, m]))

  const guiLuu = () => {
    // Chỉ gửi ô đã đổi so với DB; khoá bí mật rỗng thì không gửi (giữ nguyên).
    const gui: Record<string, string> = {}
    for (const m of data.settings) {
      const moi = (form[m.key] ?? "").trim()
      if (m.bi_mat) {
        if (moi) gui[m.key] = moi
        continue
      }
      const cu = m.nguon === "db" ? m.value : ""
      if (moi !== cu) gui[m.key] = moi
    }
    if (!Object.keys(gui).length) {
      toast.info("Chưa có thay đổi nào")
      return
    }
    luu.mutate(gui)
  }

  const qr = urlVietQr(form)

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Cấu hình cửa hàng</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Thông tin liên hệ, ngân hàng, vận chuyển và email. Xoá trắng một ô rồi lưu để quay về mặc định.
        </Text>
      </div>

      {NHOM.map((nhom) => (
        <div key={nhom.id} className="px-6 py-4">
          <Heading level="h3">{nhom.ten}</Heading>
          {nhom.ghiChu && (
            <Text size="small" className="text-ui-fg-subtle mb-3">
              {nhom.ghiChu}
            </Text>
          )}
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
            {data.settings
              .filter((m) => m.nhom === nhom.id)
              .map((m) => (
                <div key={m.key} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={m.key}>{NHAN[m.key] ?? m.key}</Label>
                    {m.bi_mat && m.nguon === "db" && <Badge size="2xsmall" color="green">đã đặt</Badge>}
                    {m.nguon === "mac_dinh" && <Badge size="2xsmall" color="grey">mặc định</Badge>}
                  </div>
                  <Input
                    id={m.key}
                    type={m.bi_mat ? "password" : "text"}
                    autoComplete="off"
                    value={form[m.key] ?? ""}
                    placeholder={
                      m.bi_mat
                        ? m.nguon === "db"
                          ? `Đã đặt (${m.value}). Để trống để giữ nguyên`
                          : "Chưa đặt"
                        : m.mac_dinh
                          ? `Mặc định: ${m.mac_dinh}`
                          : ""
                    }
                    onChange={(e) => setForm((f) => ({ ...f, [m.key]: e.target.value }))}
                  />
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {mucTheoKhoa.get(m.key)?.mo_ta}
                  </Text>
                </div>
              ))}
          </div>

          {nhom.id === "ngan_hang" && (
            <div className="mt-4">
              {qr ? (
                <div>
                  <Text size="small" weight="plus">Xem trước VietQR</Text>
                  <img src={qr} alt="Xem trước VietQR" className="mt-2 h-auto w-56 rounded border" />
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Ảnh tải từ img.vietqr.io theo giá trị đang nhập (chưa cần lưu).
                  </Text>
                </div>
              ) : (
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Nhập mã ngân hàng (ví dụ MB hoặc BIN 6 số) và số tài khoản hợp lệ để xem trước VietQR.
                </Text>
              )}
            </div>
          )}
        </div>
      ))}

      <div className="flex justify-end gap-2 px-6 py-4">
        <Button onClick={guiLuu} isLoading={luu.isPending}>
          Lưu thay đổi
        </Button>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Cấu hình cửa hàng",
  icon: CogSixToothSolid,
})

export default CaiDatCuaHangPage
