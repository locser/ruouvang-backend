import { MedusaRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  completeOrderWorkflow,
  createOrderFulfillmentWorkflow,
  capturePaymentWorkflow,
} from "@medusajs/medusa/core-flows";
import * as crypto from "crypto";
import { ghiNhatKy } from "./nhat-ky";

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

  // ---- Chống bấm trùng ----
  try {
    const cu = await pg.raw(
      "SELECT trang_thai, ket_qua FROM ai_action_log WHERE idempotency_key = ?",
      [idempotencyKey]
    );
    if (cu.rows.length > 0) {
      const log = cu.rows[0];
      if (log.trang_thai === "XONG") {
        return {
          status: 200,
          body: {
            ok: true,
            da_xu_ly_truoc_do: true,
            ket_qua: log.ket_qua,
            ghi_chu: "Đơn này đã được duyệt hoàn thành trước đó.",
          },
        };
      }
      if (log.trang_thai === "DANG_CHAY") {
        return {
          status: 409,
          body: { error: "Đơn này đang được xử lý, vui lòng đợi vài giây rồi thử lại." },
        };
      }
      await pg.raw("DELETE FROM ai_action_log WHERE idempotency_key = ?", [idempotencyKey]);
    }

    await pg.raw(
      "INSERT INTO ai_action_log (idempotency_key, hanh_dong, tham_so, trang_thai) VALUES (?, ?, ?, ?)",
      [idempotencyKey, "order_complete", JSON.stringify({ order_id, tracking_code }), "DANG_CHAY"]
    );
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
        "items.id", "items.quantity", "items.detail.*",
        "fulfillments.id",
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
    const payments: any[] = (order.payment_collections ?? [])
      .flatMap((pc: any) => pc.payments ?? [])
      .filter(Boolean);

    if (payments.length === 0) {
      buoc.canh_bao.push("Đơn chưa có payment nào để thu — bỏ qua bước capture.");
    } else {
      for (const p of payments) {
        if (p.captured_at) continue;
        try {
          await capturePaymentWorkflow(req.scope).run({ input: { payment_id: p.id } });
          buoc.captured_payment = true;
        } catch (e: any) {
          buoc.canh_bao.push(`Không capture được payment ${p.id}: ${e?.message ?? e}`);
        }
      }
      if (payments.every((p) => p.captured_at)) {
        buoc.captured_payment = true;
        buoc.canh_bao.push("Payment đã được thu từ trước.");
      }
    }

    // ---- 2. Tạo fulfillment ----
    const daCoFulfillment = (order.fulfillments ?? []).length > 0;
    if (daCoFulfillment) {
      buoc.created_fulfillment = true;
      buoc.canh_bao.push("Đơn đã có fulfillment từ trước — không tạo thêm.");
    } else {
      const items = (order.items ?? [])
        .map((it: any) => ({ id: it.id, quantity: Number(it.quantity) || 0 }))
        .filter((it: any) => it.quantity > 0);

      if (items.length === 0) {
        buoc.canh_bao.push("Đơn không có dòng hàng nào để giao — bỏ qua fulfillment.");
      } else {
        await createOrderFulfillmentWorkflow(req.scope).run({
          input: { order_id, items },
        });
        buoc.created_fulfillment = true;
      }
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
      await orderModule.updateOrders([
        {
          id: order_id,
          metadata: {
            ...(order.metadata ?? {}),
            tracking_code: maVanDon,
            // Tiền đã thu (capture) ⇒ đổi nhãn "chờ chuyển khoản" thành "đã thanh toán".
            ...(buoc.captured_payment ? { thanh_toan_trang_thai: "da_thanh_toan" } : {}),
          },
        },
      ]);
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
      "UPDATE ai_action_log SET trang_thai = ?, ket_qua = ? WHERE idempotency_key = ?",
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
      .raw("UPDATE ai_action_log SET trang_thai = ?, ket_qua = ? WHERE idempotency_key = ?", [
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
