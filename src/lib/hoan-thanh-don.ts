import { MedusaRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  completeOrderWorkflow,
  createOrderFulfillmentWorkflow,
} from "@medusajs/medusa/core-flows";
import * as crypto from "crypto";
import { ghiNhatKy } from "./nhat-ky";
import { capturePayments, claimActionLog, readOrderPayments, withOrderPaymentLock } from "./order-locks";

/**
 * Duyệt Giao & Hoàn Thành đơn hàng (1-Tap Settlement) — logic dùng chung.
 *
 * Được gọi từ hai nơi:
 *   - POST /ai/order-complete (khóa x-ai-secret-key, cho AI/chatbot)
 *   - POST /admin/don-hang/:id/hoan-thanh (đăng nhập admin, cho nhân viên)
 *
 * VÌ SAO KHÔNG DÙNG SQL UPDATE TRỰC TIẾP: bảng `order` của Medusa v2 không có
 * `tenant_id`, `payment_status`/`fulfillment_status` là giá trị suy ra chứ không
 * phải cột lưu sẵn, và ghi thẳng SQL bỏ qua workflow (tồn kho, sự kiện, audit).
 * Vì vậy gọi đúng 3 workflow chính thức của Medusa v2.17.2:
 *     capturePaymentWorkflow        { payment_id, amount? }
 *     createOrderFulfillmentWorkflow { order_id, items: [{ id, quantity }] }
 *     completeOrderWorkflow          { orderIds: string[] }
 *
 * TÍNH BỀN VỚI THAO TÁC LẶP: dùng `ai_action_log` với UNIQUE(idempotency_key)
 * làm trọng tài. Bấm lại trả về kết quả cũ thay vì ghi nhận doanh thu hai lần.
 * Ba workflow không nằm trong một transaction chung; nếu bước sau lỗi, trả về
 * đúng các bước đã xong để người vận hành biết đang ở đâu.
 */

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

interface KetQuaBuoc {
  captured_payment: boolean;
  created_fulfillment: boolean;
  completed_order: boolean;
  tracking_code: string | null;
  canh_bao: string[];
}

/**
 * Số còn phải xuất kho của từng dòng hàng = số đặt − số đã xuất kho.
 *
 * Tính theo phần CÒN LẠI chứ không hỏi "đơn đã có fulfillment chưa": đơn mới
 * xuất kho một phần (3 chai, mới Fulfill 2) vẫn được xuất nốt trước khi đóng.
 */
export function dongCanXuatKho(items: any[] | null | undefined): { id: string; quantity: number }[] {
  return (items ?? [])
    .map((it: any) => {
      const daDat = Number(it?.quantity ?? it?.detail?.quantity) || 0;
      const daXuat = Number(it?.detail?.fulfilled_quantity) || 0;
      return { id: it?.id, quantity: daDat - daXuat };
    })
    .filter((it) => it.id && it.quantity > 0);
}

export interface KetQuaHoanThanhDon {
  status: number;
  body: Record<string, unknown>;
}

export async function hoanThanhDon(
  req: MedusaRequest,
  order_id: string,
  tracking_code?: string
): Promise<KetQuaHoanThanhDon> {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const pg = req.scope.resolve("__pg_connection__") as any;

  const idempotencyKey = sha256(`order_complete|${order_id}`);

  // ---- Chống bấm trùng (upsert nguyên tử; XONG thì trả kết quả cũ) ----
  try {
    const c = await claimActionLog(
      pg,
      idempotencyKey,
      "order_complete",
      { order_id, tracking_code },
      { rerunDone: false }
    );
    if (!c.acquired) {
      if (c.trang_thai === "XONG") {
        return {
          status: 200,
          body: {
            ok: true,
            da_xu_ly_truoc_do: true,
            ket_qua: c.ket_qua,
            ghi_chu: "Đơn này đã được duyệt hoàn thành trước đó.",
          },
        };
      }
      return {
        status: 409,
        body: { error: "Đơn này đang được xử lý, vui lòng đợi vài giây rồi thử lại." },
      };
    }
  } catch (e: any) {
    logger.error(`[order-complete] Không ghi được nhật ký idempotency: ${e?.message ?? e}`);
    return { status: 500, body: { error: "Không khởi tạo được phiên duyệt đơn" } };
  }

  const buoc: KetQuaBuoc = {
    captured_payment: false,
    created_fulfillment: false,
    completed_order: false,
    tracking_code: null,
    canh_bao: [],
  };

  try {
    // ---- Đọc đơn hàng ----
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id", "status", "total", "currency_code",
        // Medusa 2.17: chọn lẻ `items.quantity` thì nhận về rỗng — số lượng chỉ
        // được tính khi lấy cả dòng hàng (`items.*`). `detail` có số đã xuất kho.
        "items.*", "items.detail.*",
        "payment_collections.id", "payment_collections.status",
        "payment_collections.payments.id", "payment_collections.payments.captured_at",
      ],
      filters: { id: order_id },
    });

    const order: any = orders?.[0];
    if (!order) {
      throw new Error(`Không tìm thấy đơn hàng ${order_id}`);
    }
    if (order.status === "completed") {
      buoc.completed_order = true;
      buoc.canh_bao.push("Đơn đã ở trạng thái completed từ trước.");
    }
    if (order.status === "canceled") {
      throw new Error("Đơn hàng đã bị huỷ — không thể duyệt hoàn thành.");
    }

    // ---- 1. Thu tiền (capture payment) ----
    // Khoá chung theo đơn với /ai/order-payment-received; đọc lại payment trong khoá.
    const khoaCapture = await withOrderPaymentLock(req.scope, order_id, async () => {
      const payments = await readOrderPayments(req.scope, order_id);
      if (payments.length === 0) {
        buoc.canh_bao.push("Đơn chưa có payment nào để thu — bỏ qua bước capture.");
        return;
      }
      const cap = await capturePayments(req.scope, payments);
      if (cap.captured.length > 0) buoc.captured_payment = true;
      for (const f of cap.failed) {
        buoc.canh_bao.push(`Không capture được payment ${f.id}: ${f.message}`);
      }
      if (cap.total === 0) {
        buoc.canh_bao.push("Đơn không có khoản thanh toán còn hiệu lực để thu");
      }
      if (cap.total > 0 && cap.allCaptured) {
        buoc.captured_payment = true;
        if (cap.captured.length === 0) buoc.canh_bao.push("Payment đã được thu từ trước.");
      }
    });
    if (khoaCapture.lockFailed) {
      throw new Error(
        khoaCapture.reason === "timeout"
          ? "Đơn đang được xác nhận tiền ở nơi khác, vui lòng thử lại sau vài giây."
          : "Hệ thống khoá đơn đang gặp sự cố, vui lòng thử lại sau."
      );
    }

    // ---- 2. Xuất kho (tạo fulfillment) cho phần còn chưa xuất ----
    if ((order.items ?? []).length === 0) {
      throw new Error("Đơn không có dòng hàng nào — không thể duyệt hoàn thành.");
    }
    const items = dongCanXuatKho(order.items);
    if (items.length === 0) {
      buoc.created_fulfillment = true;
      buoc.canh_bao.push("Đơn đã xuất kho đủ từ trước — không tạo thêm.");
    } else {
      // Lỗi ở đây ném ra ngoài: hàng chưa xuất kho thì KHÔNG đóng đơn,
      // nhật ký ghi LOI để nhân viên bấm Duyệt lại.
      await createOrderFulfillmentWorkflow(req.scope).run({
        input: { order_id, items },
      });
      buoc.created_fulfillment = true;
    }

    // ---- 3. Hoàn thành đơn ----
    if (!buoc.completed_order) {
      await completeOrderWorkflow(req.scope).run({ input: { orderIds: [order_id] } });
      buoc.completed_order = true;
    }

    // ---- 4. Lưu mã vận đơn vào metadata ----
    const maVanDon =
      typeof tracking_code === "string" && tracking_code.trim().length > 0
        ? tracking_code.trim()
        : `VPH-DELIVERY-${order_id.slice(-8).toUpperCase()}`;
    buoc.tracking_code = maVanDon;

    try {
      const orderModule: any = req.scope.resolve(Modules.ORDER);
      // Ghi trong khoá và đọc lại metadata mới nhất để không đè mất cập nhật của route xác nhận tiền.
      await withOrderPaymentLock(req.scope, order_id, async () => {
        const { data: moi } = await query.graph({
          entity: "order",
          fields: ["id", "metadata"],
          filters: { id: order_id },
        });
        const metadataMoi = ((moi?.[0] as any)?.metadata ?? order.metadata ?? {}) as Record<string, unknown>;
        await orderModule.updateOrders([
          {
            id: order_id,
            metadata: {
              ...metadataMoi,
              tracking_code: maVanDon,
              // Tiền đã thu (capture) ⇒ đổi nhãn "chờ chuyển khoản" thành "đã thanh toán".
              ...(buoc.captured_payment ? { thanh_toan_trang_thai: "da_thanh_toan" } : {}),
            },
          },
        ]);
      }).then((r) => {
        if (r.lockFailed) buoc.canh_bao.push("Không lưu được mã vận đơn vào metadata: không giành được khoá đơn.");
      });
    } catch (e: any) {
      buoc.canh_bao.push(`Không lưu được mã vận đơn vào metadata: ${e?.message ?? e}`);
    }

    const ketQua = {
      order_id,
      total: order.total,
      currency_code: order.currency_code,
      ...buoc,
    };

    await pg.raw(
      "UPDATE ai_action_log SET trang_thai = ?, ket_qua = ?, xong_luc = now() WHERE idempotency_key = ?",
      ["XONG", JSON.stringify(ketQua), idempotencyKey]
    );

    logger.info(`[order-complete] Đã duyệt hoàn thành đơn ${order_id}, mã vận đơn ${maVanDon}`);
    await ghiNhatKy(req, {
      doi_tuong: "order",
      doi_tuong_id: order_id,
      hanh_dong: "duyet_hoan_thanh",
      truoc: { status: order.status },
      sau: { status: "completed", ...ketQua },
    });
    return { status: 200, body: { ok: true, ket_qua: ketQua } };
  } catch (err: any) {
    const thongDiep = err?.message ?? String(err);
    await pg
      .raw("UPDATE ai_action_log SET trang_thai = ?, ket_qua = ?, xong_luc = now() WHERE idempotency_key = ?", [
        "LOI",
        JSON.stringify({ loi: thongDiep, buoc_da_xong: buoc }),
        idempotencyKey,
      ])
      .catch(() => undefined);

    logger.error(`[order-complete] Lỗi khi duyệt đơn ${order_id}: ${thongDiep}`);
    await ghiNhatKy(req, {
      doi_tuong: "order",
      doi_tuong_id: order_id,
      hanh_dong: "duyet_hoan_thanh_loi",
      sau: { buoc_da_xong: buoc },
      ghi_chu: thongDiep,
    });
    // Trả về đúng những bước ĐÃ hoàn thành để người vận hành biết đang ở đâu.
    return {
      status: 500,
      body: {
        ok: false,
        error: thongDiep,
        buoc_da_xong: buoc,
        ghi_chu: "Có thể bấm Duyệt lại — hệ thống sẽ chạy tiếp từ bước còn dở.",
      },
    };
  }
}
