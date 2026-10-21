import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import { useState } from "react"

/**
 * NÚT "ĐỒNG BỘ TOÀN BỘ" trên trang danh sách sản phẩm — cho nhân viên.
 *
 * Gọi `POST /admin/meili/dong-bo-toan-bo`: cấu hình index rồi đối soát toàn bộ
 * sản phẩm với Meilisearch. Dùng khi trang tìm kiếm thiếu/thừa sản phẩm, hoặc
 * lần đầu dựng Meilisearch — thay cho lệnh `sync-meili.ts` trên máy chủ.
 */

type KetQua = {
  ok?: boolean
  error?: string
  da_doc?: number
  them_moi?: number
  cap_nhat?: number
  xoa_mo_coi?: number
  khop_san?: number
  giay?: number
  canh_bao?: string[]
}

const NutDongBoToanBoTimKiem = () => {
  const [dangChay, setDangChay] = useState(false)
  const [thongBao, setThongBao] = useState<{ loai: "ok" | "loi"; noi: string[] } | null>(null)

  const chay = async () => {
    setDangChay(true)
    setThongBao(null)
    try {
      const res = await fetch(`/admin/meili/dong-bo-toan-bo`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      })
      const kq = (await res.json().catch(() => ({}))) as KetQua
      if (kq.da_doc !== undefined) {
        setThongBao({
          loai: res.ok && kq.ok ? "ok" : "loi",
          noi: [
            `Đã đồng bộ ${kq.da_doc} sản phẩm trong ${kq.giay ?? 0} giây: thêm ${kq.them_moi}, ` +
              `cập nhật ${kq.cap_nhat}, gỡ ${kq.xoa_mo_coi}, khớp sẵn ${kq.khop_san}.`,
            ...(kq.canh_bao ?? []),
          ],
        })
      } else {
        setThongBao({ loai: "loi", noi: [kq.error ?? "Đồng bộ không thành công. Thử lại sau."] })
      }
    } catch {
      setThongBao({ loai: "loi", noi: ["Không kết nối được máy chủ. Thử lại sau."] })
    } finally {
      setDangChay(false)
    }
  }

  return (
    <Container className="flex flex-col gap-y-3">
      <Heading level="h2">Đồng bộ tìm kiếm — toàn bộ sản phẩm</Heading>
      <Text size="small" className="text-ui-fg-subtle">
        Đưa toàn bộ sản phẩm lên trang tìm kiếm và trợ lý bán hàng: thêm sản phẩm còn thiếu, gỡ sản phẩm đã ẩn,
        cập nhật giá và tồn kho. Hệ thống cũng tự làm việc này lúc 3 giờ sáng mỗi đêm.
      </Text>
      <div>
        <Button variant="secondary" onClick={chay} isLoading={dangChay} disabled={dangChay}>
          Đồng bộ toàn bộ
        </Button>
      </div>
      {thongBao &&
        thongBao.noi.map((dong, i) => (
          <Text
            key={i}
            size="small"
            className={thongBao.loai === "ok" && i === 0 ? "text-ui-fg-interactive" : "text-ui-fg-error"}
          >
            {dong}
          </Text>
        ))}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.list.before",
})

export default NutDongBoToanBoTimKiem
