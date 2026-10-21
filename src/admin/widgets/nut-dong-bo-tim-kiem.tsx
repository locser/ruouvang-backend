import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import { useState } from "react"

/**
 * NÚT "ĐỒNG BỘ TÌM KIẾM" trên trang chi tiết sản phẩm — cho nhân viên.
 *
 * Gọi `POST /admin/san-pham/:id/dong-bo-meili`. Bấm sau khi đổi giá hoặc tồn kho
 * để trang tìm kiếm và bot hiện số mới ngay, không cần chạy lệnh trên máy chủ.
 */

type KetQua = {
  ok?: boolean
  error?: string
  da_dong_bo?: boolean
  price_vnd?: number
  in_stock?: boolean
  ghi_chu?: string
}

const NutDongBoTimKiem = ({ data }: { data: { id: string } }) => {
  const [dangChay, setDangChay] = useState(false)
  const [thongBao, setThongBao] = useState<{ loai: "ok" | "loi"; noi: string } | null>(null)

  const chay = async () => {
    setDangChay(true)
    setThongBao(null)
    try {
      const res = await fetch(`/admin/san-pham/${data.id}/dong-bo-meili`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      })
      const kq = (await res.json().catch(() => ({}))) as KetQua

      if (res.ok && kq.ok) {
        setThongBao({
          loai: "ok",
          noi: kq.da_dong_bo
            ? `Đã đồng bộ. Giá trên tìm kiếm: ${(kq.price_vnd ?? 0).toLocaleString("vi-VN")}đ, ${kq.in_stock ? "còn hàng" : "hết hàng"}.`
            : kq.ghi_chu ?? "Đã gỡ sản phẩm khỏi tìm kiếm.",
        })
      } else {
        setThongBao({ loai: "loi", noi: kq.error ?? "Đồng bộ không thành công. Thử lại sau." })
      }
    } catch {
      setThongBao({ loai: "loi", noi: "Không kết nối được máy chủ. Thử lại sau." })
    } finally {
      setDangChay(false)
    }
  }

  return (
    <Container className="flex flex-col gap-y-3">
      <Heading level="h2">Đồng bộ tìm kiếm</Heading>
      <Text size="small" className="text-ui-fg-subtle">
        Cập nhật giá và tồn kho của sản phẩm này lên trang tìm kiếm và trợ lý bán hàng. Bấm sau mỗi lần đổi giá.
      </Text>
      <div>
        <Button variant="primary" onClick={chay} isLoading={dangChay} disabled={dangChay}>
          Đồng bộ ngay
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
  zone: "product.details.side.after",
})

export default NutDongBoTimKiem
