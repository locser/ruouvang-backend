import { ExecArgs } from "@medusajs/framework/types"
import {
  createOrderFulfillmentWorkflow,
  getOrderDetailWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * E2E nút "Duyệt hoàn thành" — chạy trên backend + storefront ĐANG CHẠY:
 *
 *   pnpm run test:e2e:duyet-don
 *
 * Đi đúng đường thật: khách đặt hàng qua storefront (/api/dat-hang), duyệt qua
 * HTTP /ai/order-complete, rồi soi DB xem đơn đã xuất kho và kho đã trừ chưa.
 *
 *   A. Đặt 2 chai → bấm thẳng Duyệt         → xuất kho 2, kho −2, hết giữ chỗ
 *   B. Đặt 3 chai → Fulfill tay 2 → Duyệt    → xuất nốt 1 (không đóng đơn thiếu hàng)
 *   C. Bấm Duyệt lại đơn A                   → không trừ kho lần hai
 *
 * Tạo đơn thật trong DB đang trỏ tới — chỉ chạy trên local/staging.
 * Email để trống ⇒ storefront dùng `<sđt>@khach.local`, không gửi mail ra ngoài.
 */

const STOREFRONT = process.env.E2E_STOREFRONT_URL || "http://localhost:8900"
const BACKEND = process.env.E2E_BACKEND_URL || `http://localhost:${process.env.SERVICE_PORT || 9000}`
const HANDLE = process.env.E2E_HANDLE || "bone-dry-pinot-gris-2025-copy-copy"
const SKU = process.env.E2E_SKU || "DB26BDPG1B"

export default async function e2eDuyetHoanThanh({ container }: ExecArgs) {
  const pg: any = container.resolve("__pg_connection__")
  const loi: string[] = []
  const kiem = (dk: boolean, moTa: string) => {
    console.log(`${dk ? "  ✔" : "  ✘"} ${moTa}`)
    if (!dk) loi.push(moTa)
  }

  const kho = async () => {
    const r = (
      await pg.raw(
        `SELECT il.stocked_quantity::int ton, il.reserved_quantity::int giu
         FROM product_variant v
         JOIN product_variant_inventory_item pvi ON pvi.variant_id = v.id AND pvi.deleted_at IS NULL
         JOIN inventory_level il ON il.inventory_item_id = pvi.inventory_item_id AND il.deleted_at IS NULL
         WHERE v.sku = ? AND v.deleted_at IS NULL`,
        [SKU]
      )
    ).rows[0]
    if (!r) throw new Error(`Không thấy tồn kho cho SKU ${SKU}`)
    return r as { ton: number; giu: number }
  }

  const datHang = async (soLuong: number): Promise<string> => {
    const res = await fetch(`${STOREFRONT}/api/dat-hang`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hoTen: "Khách E2E",
        dienThoai: "0900000000",
        diaChi: "1 Đường Kiểm Thử, Quận 1",
        phuongThucThanhToan: "cod",
        maGiamGia: "",
        monHang: [{ handle: HANDLE, sku: SKU, soLuong }],
      }),
    })
    const body: any = await res.json()
    if (!res.ok || !body?.donHang?.id) throw new Error(`Đặt hàng lỗi ${res.status}: ${JSON.stringify(body)}`)
    console.log(`  · đặt đơn ${body.donHang.ma} (${soLuong} chai)`)
    return body.donHang.id
  }

  const duyet = async (orderId: string) => {
    const res = await fetch(`${BACKEND}/ai/order-complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ai-secret-key": process.env.CONFIG_INTERNAL_SERVICE_KEY || "",
      },
      body: JSON.stringify({ order_id: orderId }),
    })
    return { status: res.status, body: (await res.json()) as any }
  }

  const don = async (orderId: string) => {
    const { result } = await getOrderDetailWorkflow(container).run({
      input: {
        order_id: orderId,
        fields: ["id", "status", "payment_status", "fulfillment_status", "items.*", "fulfillments.id"],
      },
    })
    const o: any = result
    return {
      status: o.status,
      giao_hang: o.fulfillment_status,
      so_phieu: (o.fulfillments ?? []).length,
      da_xuat: (o.items ?? []).reduce((t: number, i: any) => t + Number(i.detail?.fulfilled_quantity ?? 0), 0),
    }
  }

  // ---- A ----
  console.log("A. Đặt 2 chai → bấm thẳng Duyệt hoàn thành")
  const khoA0 = await kho()
  const donA = await datHang(2)
  const rA = await duyet(donA)
  const dA = await don(donA)
  const khoA1 = await kho()
  kiem(rA.status === 200 && rA.body?.ok === true, `nút duyệt trả 200/ok (nhận ${rA.status} ${rA.body?.error ?? ""})`)
  kiem(dA.status === "completed", `đơn hoàn tất (nhận ${dA.status})`)
  kiem(dA.giao_hang === "fulfilled", `giao hàng = fulfilled (nhận ${dA.giao_hang})`)
  kiem(dA.so_phieu === 1 && dA.da_xuat === 2, `1 phiếu, xuất 2 chai (nhận ${dA.so_phieu} phiếu, ${dA.da_xuat} chai)`)
  kiem(khoA1.ton === khoA0.ton - 2, `kho trừ 2: ${khoA0.ton} → ${khoA1.ton}`)
  kiem(khoA1.giu === khoA0.giu, `hết giữ chỗ cho đơn: giữ ${khoA0.giu} → ${khoA1.giu}`)

  // ---- B ----
  console.log("B. Đặt 3 chai → Fulfill tay 2 chai → Duyệt hoàn thành")
  const khoB0 = await kho()
  const donB = await datHang(3)
  const { data: dong } = await (container.resolve("query") as any).graph({
    entity: "order",
    fields: ["items.*"],
    filters: { id: donB },
  })
  await createOrderFulfillmentWorkflow(container).run({
    input: { order_id: donB, items: [{ id: dong[0].items[0].id, quantity: 2 }] },
  })
  const rB = await duyet(donB)
  const dB = await don(donB)
  const khoB1 = await kho()
  kiem(rB.status === 200 && rB.body?.ok === true, `nút duyệt trả 200/ok (nhận ${rB.status} ${rB.body?.error ?? ""})`)
  kiem(dB.giao_hang === "fulfilled", `giao hàng = fulfilled, không đóng đơn thiếu hàng (nhận ${dB.giao_hang})`)
  kiem(dB.so_phieu === 2 && dB.da_xuat === 3, `2 phiếu, xuất đủ 3 chai (nhận ${dB.so_phieu} phiếu, ${dB.da_xuat} chai)`)
  kiem(khoB1.ton === khoB0.ton - 3, `kho trừ 3: ${khoB0.ton} → ${khoB1.ton}`)
  kiem(khoB1.giu === khoB0.giu, `hết giữ chỗ cho đơn: giữ ${khoB0.giu} → ${khoB1.giu}`)

  // ---- C ----
  console.log("C. Bấm Duyệt lại đơn A")
  const khoC0 = await kho()
  const rC = await duyet(donA)
  const khoC1 = await kho()
  kiem(rC.status === 200 && rC.body?.da_xu_ly_truoc_do === true, "trả kết quả cũ, không chạy lại")
  kiem(khoC1.ton === khoC0.ton, `kho không trừ lần hai: ${khoC0.ton} → ${khoC1.ton}`)

  if (loi.length) {
    console.log(`E2E THẤT BẠI: ${loi.length} kiểm tra sai`)
    process.exitCode = 1
  } else {
    console.log("E2E ĐẠT: mọi kiểm tra đều đúng")
  }
}
