import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Pool } from "pg";
import { checkAuth } from "../../../lib/ai-auth";

/**
 * Tra trạng thái đơn hàng cho chatbot.
 *
 * POST /ai/order-status
 * Body: { order_code: string, phone: string }
 *
 * Khách phải đưa CẢ mã đơn LẪN số điện thoại đặt hàng. Mã đơn lộ ra được (khách
 * đã nhận trong email, trang cảm ơn), nên không dùng mã đơn làm bằng chứng sở hữu.
 *
 * Mã đơn không tồn tại, số điện thoại sai và đơn không có số điện thoại đều trả
 * CÙNG một kết quả `found: false`, để không ai dò được đơn nào tồn tại.
 *
 * Chỉ trả trạng thái, mã vận đơn và đường dẫn theo dõi. Không trả địa chỉ, email,
 * tên người nhận hay chi tiết thanh toán.
 */

const pgPool = new Pool({ connectionString: process.env.CONFIG_POSTGRES_URL_MEDUSA });

/** Chỉ giữ chữ số; đổi đầu 84 thành 0 để "+84 912..." khớp với "0912...". */
function chuanHoaSDT(v: string): string {
  let so = v.replace(/\D/g, "");
  if (so.startsWith("84") && so.length >= 11) so = "0" + so.slice(2);
  return so;
}

/** Lấy số thứ tự đơn từ mã khách gõ: "CW12", "cw 12", "12" đều thành 12. */
function layMaSo(maDon: string): number | null {
  const so = maDon.replace(/\D/g, "");
  if (!so) return null;
  const n = Number(so);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Khách có thể đọc lại mã cũ mà bot từng gửi: ID nội bộ `order_01M5...`, hoặc 8 ký
 * tự cuối (kèm tiền tố VPH). Nhận cả hai để tra được, ngoài số đơn `CW12`.
 * Trả về phần đuôi để so khớp với cuối ID, hoặc null nếu không phải dạng đó.
 */
function layDuoiIdNoiBo(maDon: string): string | null {
  const sach = maDon.trim().replace(/[^A-Za-z0-9_]/g, "").toUpperCase();
  const m = sach.match(/^ORDER_([0-9A-Z]{8,40})$/) ?? sach.match(/^(?:VPH)?([0-9A-Z]{8})$/);
  if (!m) return null;
  // "CW12" hay "12" là số đơn, không phải đuôi ID; đuôi ID luôn có chữ cái lẫn trong.
  if (/^CW\d+$/.test(sach) || /^\d+$/.test(sach)) return null;
  return m[1];
}

function trangThaiDon(status: string, daHuy: boolean): string {
  if (daHuy || status === "canceled") return "Đã huỷ";
  if (status === "completed") return "Đã hoàn thành";
  return "Đang xử lý";
}

function trangThaiThanhToan(status: string | null): string {
  switch (status) {
    case "captured":
    case "partially_captured":
      return "Đã thanh toán";
    case "authorized":
      return "Đã xác nhận thanh toán";
    case "awaiting":
      return "Chờ thanh toán";
    case "canceled":
      return "Đã huỷ thanh toán";
    default:
      return "Chưa thanh toán";
  }
}

function trangThaiGiaoHang(
  giao: Array<{ packed_at: Date | null; shipped_at: Date | null; delivered_at: Date | null }>
): string {
  if (giao.length === 0) return "Chưa tạo giao hàng";
  if (giao.some((g) => g.delivered_at)) return "Đã giao";
  if (giao.some((g) => g.shipped_at)) return "Đang giao";
  if (giao.some((g) => g.packed_at)) return "Đã đóng gói";
  return "Chờ xử lý";
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized: Invalid x-ai-secret-key header" });
  }

  const body = (req.body ?? {}) as { order_code?: unknown; phone?: unknown };
  const maDon = typeof body.order_code === "string" ? body.order_code : "";
  const sdt = typeof body.phone === "string" ? chuanHoaSDT(body.phone) : "";

  if (!maDon || !sdt) {
    return res.status(400).json({ error: "Cần order_code và phone" });
  }

  const duoiId = layDuoiIdNoiBo(maDon);
  const maSo = duoiId ? null : layMaSo(maDon);
  const khongTim = { ok: true, found: false };
  if (maSo === null && duoiId === null) return res.status(200).json(khongTim);

  try {
    const donRes = await pgPool.query(
      `
      SELECT
        o.id,
        o.display_id,
        o.status,
        o.created_at,
        o.canceled_at,
        a.phone AS sdt_nhan,
        (SELECT pc.status
           FROM order_payment_collection opc
           JOIN payment_collection pc ON pc.id = opc.payment_collection_id
          WHERE opc.order_id = o.id AND opc.deleted_at IS NULL AND pc.deleted_at IS NULL
          ORDER BY pc.created_at DESC LIMIT 1) AS trang_thai_thanh_toan
        FROM "order" o
        LEFT JOIN order_address a ON a.id = o.shipping_address_id
       WHERE ${duoiId ? "UPPER(o.id) LIKE '%' || $1" : "o.display_id = $1"} AND o.deleted_at IS NULL
       LIMIT 1
      `,
      [duoiId ?? maSo]
    );

    const don = donRes.rows[0];
    // Không tìm thấy, hoặc số điện thoại không khớp / đơn không có số: cùng một kết quả.
    if (!don || !don.sdt_nhan || chuanHoaSDT(String(don.sdt_nhan)) !== sdt) {
      return res.status(200).json(khongTim);
    }

    const giaoRes = await pgPool.query(
      `
      SELECT f.packed_at, f.shipped_at, f.delivered_at, f.canceled_at,
             (SELECT l.tracking_number FROM fulfillment_label l
               WHERE l.fulfillment_id = f.id AND l.deleted_at IS NULL
               ORDER BY l.created_at DESC LIMIT 1) AS ma_van_don,
             (SELECT l.tracking_url FROM fulfillment_label l
               WHERE l.fulfillment_id = f.id AND l.deleted_at IS NULL
               ORDER BY l.created_at DESC LIMIT 1) AS link_theo_doi
        FROM order_fulfillment ofl
        JOIN fulfillment f ON f.id = ofl.fulfillment_id
       WHERE ofl.order_id = $1 AND ofl.deleted_at IS NULL AND f.deleted_at IS NULL
         AND f.canceled_at IS NULL
       ORDER BY f.created_at DESC
      `,
      [don.id]
    );

    const giao = giaoRes.rows;
    const coVanDon = giao.find((g: any) => g.ma_van_don);

    return res.status(200).json({
      ok: true,
      found: true,
      order: {
        ma_don: `CW${don.display_id}`,
        ngay_dat: don.created_at,
        trang_thai_don: trangThaiDon(don.status, Boolean(don.canceled_at)),
        trang_thai_thanh_toan: trangThaiThanhToan(don.trang_thai_thanh_toan),
        trang_thai_giao_hang: trangThaiGiaoHang(giao),
        ma_van_don: coVanDon?.ma_van_don ?? null,
        link_theo_doi: coVanDon?.link_theo_doi ?? null,
      },
    });
  } catch (err: any) {
    console.error("[ai/order-status]", err);
    return res.status(500).json({ error: "Order lookup failed" });
  }
}
