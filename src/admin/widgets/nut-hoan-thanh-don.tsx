import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import { useState } from "react"

/**
 * NÚT "DUYỆT HOÀN THÀNH" trên trang chi tiết đơn — cho nhân viên.
 *
 * Gọi `POST /admin/don-hang/:id/hoan-thanh` (xem `src/api/admin/don-hang`).
 * Route dùng chung logic với `/ai/order-complete`: thu tiền, tạo fulfillment,
 * hoàn thành đơn. Bấm lại an toàn nhờ chống trùng phía server.
 */

type KetQua = {
  ok?: boolean
  error?: string
  ghi_chu?: string
  da_xu_ly_truoc_do?: boolean
  ket_qua?: { tracking_code?: string | null; canh_bao?: string[] }
  buoc_da_xong?: { captured_payment: boolean; created_fulfillment: boolean; completed_order: boolean }
}

const NutHoanThanhDon = ({ data }: { data: { id: string } }) => {
  const [dangChay, setDangChay] = useState(false)
  const [thongBao, setThongBao] = useState<{ loai: "ok" | "loi"; noi: string } | null>(null)

  const chay = async () => {
    if (!window.confirm("Thu tiền, tạo giao hàng và hoàn thành đơn này?")) return

    setDangChay(true)
    setThongBao(null)
    try {
      const res = await fetch(`/admin/don-hang/${data.id}/hoan-thanh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const kq = (await res.json().catch(() => ({}))) as KetQua

      if (res.ok && kq.ok !== false) {
        const canhBao = kq.ket_qua?.canh_bao?.length ? ` (${kq.ket_qua.canh_bao.join("; ")})` : ""
        const daCo = kq.da_xu_ly_truoc_do ? " Đơn này đã được duyệt trước đó." : ""
        setThongBao({
          loai: "ok",
          noi: `Đã duyệt. Mã vận đơn: ${kq.ket_qua?.tracking_code ?? "—"}.${daCo}${canhBao}`,
        })
      } else {
        const buoc = kq.buoc_da_xong
        const daXong = buoc
          ? ` Đã xong: thu tiền ${buoc.captured_payment ? "có" : "chưa"}, giao hàng ${buoc.created_fulfillment ? "có" : "chưa"}, hoàn thành ${buoc.completed_order ? "có" : "chưa"}.`
          : ""
        setThongBao({
          loai: "loi",
          noi: `${kq.error ?? "Không duyệt được đơn."}${daXong} ${kq.ghi_chu ?? ""}`.trim(),
        })
      }
    } catch {
      setThongBao({ loai: "loi", noi: "Không kết nối được máy chủ. Thử lại sau." })
    } finally {
      setDangChay(false)
    }
  }

  return (
    <Container className="flex flex-col gap-y-3">
      <Heading level="h2">Duyệt giao và hoàn thành</Heading>
      <Text size="small" className="text-ui-fg-subtle">
        Thu tiền, tạo giao hàng và đánh dấu hoàn thành đơn. Có thể bấm lại nếu lần trước dừng giữa chừng.
      </Text>
      <div>
        <Button variant="primary" onClick={chay} isLoading={dangChay} disabled={dangChay}>
          Duyệt hoàn thành
        </Button>
      </div>
      {thongBao && (
        <Text size="small" className={thongBao.loai === "ok" ? "text-ui-fg-interactive" : "text-ui-fg-error"}>
          {thongBao.noi}
        </Text>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default NutHoanThanhDon
