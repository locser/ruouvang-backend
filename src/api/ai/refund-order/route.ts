import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { cancelOrderWorkflow, refundPaymentWorkflow } from "@medusajs/medusa/core-flows";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import * as crypto from "crypto";
import { checkAuth } from "../../../lib/ai-auth";
import { ghiNhatKy } from "../../../lib/nhat-ky";
import { PAYMENT_FIELDS, claimActionLog, withOrderPaymentLock } from "../../../lib/order-locks";

/**
 * Hủy đơn / hoàn một phần tiền (huy_hoan_tien).
 *
 * POST /ai/refund-order  Body: { orderId | order_id, reason?, partial?, refundAmount? }
 *
 * NHÁNH HUỶ CẢ ĐƠN (mặc định): chỉ huỷ đơn chưa giao.
 *   Chạy trong khoá theo đơn (chung với xác nhận tiền / duyệt hoàn thành) + claimActionLog
 *   `order_cancel|<id>`; đọc lại đơn trong khoá.
 *   Thành công: { ok, mode:"cancel", already:false, display_id, paid_amount, needs_manual_refund, canh_bao }.
 *   Đã huỷ từ trước: 200 cùng các trường tiền, already:true; tính lại tiền và bù nhãn can_hoan_thu_cong nếu thiếu.
 *   paid_amount = captured_amount - refunded_before (>= 0); needs_manual_refund theo captured_amount > 0 hoặc nhãn da_thanh_toan.
 *   LƯU Ý TIỀN: provider thanh toán là pp_system_default, refund chỉ GHI SỔ, không có tiền nào
 *   thật sự quay về khách. Vì vậy đơn đã thu tiền (paid_amount > 0 hoặc nhãn da_thanh_toan) được
 *   gắn metadata.thanh_toan_trang_thai = "can_hoan_thu_cong" và needs_manual_refund = true:
 *   nhân viên phải chuyển trả khách bằng tay.
 *   Mã lỗi: unauthorized, missing_order_id, order_not_found, order_completed (409),
 *   has_fulfillment (409), order_status_invalid (409), in_progress (409), lock_error (500),
 *   internal_error (500).
 *
 * NHÁNH PARTIAL (partial=true + refundAmount): giữ hành vi cũ, KHÔNG huỷ đơn. Lỗi có thêm code:
 *   payment_not_found (404), internal_error (500).
 */

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** captured = tổng captures; refunded = tổng refunds đã ghi sổ; paid = captured - refunded (>= 0). */
function tinhTien(order: any): { captured: number; refunded: number; paid: number } {
  let captured = 0;
  let refunded = 0;
  const payments: any[] = (order?.payment_collections ?? []).flatMap((pc: any) => pc.payments ?? []).filter(Boolean);
  for (const p of payments) {
    if (p.canceled_at) continue;
    const caps = (p.captures ?? []).reduce((s: number, c: any) => s + (Number(c?.amount) || 0), 0);
    captured += caps > 0 ? caps : p.captured_at ? Number(p.amount) || 0 : 0;
    refunded += (p.refunds ?? []).reduce((s: number, r: any) => s + (Number(r?.amount) || 0), 0);
  }
  return { captured, refunded, paid: Math.max(0, captured - refunded) };
}

type Out = { status: number; body: Record<string, unknown> };

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res
      .status(401)
      .json({ error: "Unauthorized: Invalid x-ai-secret-key header", code: "unauthorized" });
  }
  const b = (req.body ?? {}) as {
    orderId?: string;
    order_id?: string;
    reason?: string;
    refundAmount?: number;
    partial?: boolean;
  };
  const orderId = typeof b.orderId === "string" && b.orderId ? b.orderId : b.order_id;
  if (!orderId || typeof orderId !== "string") {
    return res.status(400).json({ error: "Thiếu orderId", code: "missing_order_id" });
  }

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);

  // ---------- Nhánh hoàn một phần (hành vi cũ) ----------
  if (b.partial === true && b.refundAmount && Number(b.refundAmount) > 0) {
    try {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
      const { data } = await query.graph({
        entity: "order",
        fields: ["id", "payment_collections.payments.id", "payment_collections.payments.amount"],
        filters: { id: orderId },
      });
      const payment = (data?.[0]?.payment_collections || [])
        .flatMap((pc: any) => pc.payments || [])
        .find((p: any) => p?.id);
      if (!payment) {
        return res
          .status(404)
          .json({ error: "Không tìm thấy khoản thanh toán của đơn để hoàn.", code: "payment_not_found" });
      }
      await refundPaymentWorkflow(req.scope).run({
        input: { payment_id: payment.id, amount: Number(b.refundAmount), note: b.reason },
      });
      return res.status(200).json({
        ok: true,
        mode: "partial_refund",
        message: `Đã hoàn ${b.refundAmount}đ cho đơn ${orderId}.`,
      });
    } catch (err: any) {
      logger.error(`refund-order lỗi: ${err.message}`);
      return res.status(500).json({
        error: err.message,
        code: "internal_error",
        goi_y: "Nếu đơn đã/đang giao (có fulfillment) thì không thể tự hủy — cần xử lý đổi trả (create-return).",
      });
    }
  }

  // ---------- Nhánh huỷ cả đơn ----------
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const pg = req.scope.resolve("__pg_connection__") as any;
  const key = sha256(`order_cancel|${orderId}`);
  const inProgress: Out = {
    status: 409,
    body: { error: "Đơn này đang được xử lý, vui lòng đợi vài giây rồi thử lại.", code: "in_progress" },
  };
  let claimed = false;
  const fail = async (status: number, error: string, code: string): Promise<Out> => {
    if (claimed) {
      await pg
        .raw("UPDATE ai_action_log SET trang_thai = ?, ket_qua = ?, xong_luc = now() WHERE idempotency_key = ?", [
          "LOI",
          JSON.stringify({ loi: error, code }),
          key,
        ])
        .catch(() => undefined);
    }
    return { status, body: { error, code } };
  };

  /** Gắn can_hoan_thu_cong (merge metadata đọc trong khoá). Trả thông báo lỗi nếu ghi hỏng. */
  const ghiNhan = async (id: string, md: Record<string, unknown>): Promise<string | null> => {
    try {
      const orderModule: any = req.scope.resolve(Modules.ORDER);
      await orderModule.updateOrders([{ id, metadata: { ...md, thanh_toan_trang_thai: "can_hoan_thu_cong" } }]);
      return null;
    } catch (e: any) {
      const m = `Không ghi được nhãn can_hoan_thu_cong: ${e?.message ?? e}`;
      logger.error(`[refund-order] ${m}`);
      return m;
    }
  };

  const job = async (): Promise<Out> => {
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id", "display_id", "status", "metadata",
        "fulfillments.id", "fulfillments.canceled_at",
        ...PAYMENT_FIELDS,
        "payment_collections.payments.refunds.amount",
      ],
      filters: { id: orderId },
    });
    const order: any = orders?.[0];
    if (!order) {
      return { status: 404, body: { error: `Không tìm thấy đơn hàng ${orderId}`, code: "order_not_found" } };
    }
    if (order.status === "canceled") {
      // Đã huỷ từ trước (admin huỷ, hoặc lần trước chết giữa chừng): tính lại tiền và bù nhãn nếu thiếu.
      const money = tinhTien(order);
      const md0 = (order.metadata ?? {}) as Record<string, unknown>;
      const canTay = money.captured > 0 || md0.thanh_toan_trang_thai === "da_thanh_toan";
      const canhBao0: string[] = [];
      if (canTay && md0.thanh_toan_trang_thai !== "can_hoan_thu_cong") {
        const loi = await ghiNhan(orderId, md0);
        if (loi) canhBao0.push(loi);
      }
      return {
        status: 200,
        body: {
          ok: true, mode: "cancel", already: true, display_id: order.display_id,
          paid_amount: money.paid, captured_amount: money.captured, refunded_before: money.refunded,
          needs_manual_refund: canTay, canh_bao: canhBao0,
        },
      };
    }
    if (order.status === "completed") {
      return {
        status: 409,
        body: { error: "Đơn đã hoàn thành, không thể huỷ — cần xử lý đổi trả.", code: "order_completed" },
      };
    }
    if ((order.fulfillments ?? []).some((f: any) => f && !f.canceled_at)) {
      return {
        status: 409,
        body: { error: "Đơn đã/đang giao (có xuất kho chưa huỷ), không thể tự huỷ — cần xử lý đổi trả.", code: "has_fulfillment" },
      };
    }
    if (order.status !== "pending") {
      return {
        status: 409,
        body: { error: `Đơn ở trạng thái "${order.status}" — không thể huỷ.`, code: "order_status_invalid" },
      };
    }

    try {
      const c = await claimActionLog(pg, key, "order_cancel", { order_id: orderId, reason: b.reason }, { rerunDone: true });
      if (!c.acquired) return inProgress;
      claimed = true;
    } catch (e: any) {
      logger.error(`[refund-order] Không ghi được nhật ký idempotency: ${e?.message ?? e}`);
      return { status: 500, body: { error: "Không khởi tạo được phiên huỷ đơn", code: "internal_error" } };
    }

    // Tiền tính TRƯỚC khi huỷ (workflow huỷ có thể tự ghi sổ refund).
    const money = tinhTien(order);

    try {
      await cancelOrderWorkflow(req.scope).run({ input: { order_id: orderId } });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      logger.error(`[refund-order] Huỷ đơn ${orderId} lỗi: ${msg}`);
      return fail(500, msg, "internal_error");
    }

    const md = (order.metadata ?? {}) as Record<string, unknown>;
    const needsManualRefund = money.captured > 0 || md.thanh_toan_trang_thai === "da_thanh_toan";
    const canhBao: string[] = [];
    if (needsManualRefund) {
      const loi = await ghiNhan(orderId, md);
      if (loi) canhBao.push(loi);
    }

    await pg
      .raw("UPDATE ai_action_log SET trang_thai = ?, ket_qua = ?, xong_luc = now() WHERE idempotency_key = ?", [
        "XONG",
        JSON.stringify({ order_id: orderId, paid_amount: money.paid, needs_manual_refund: needsManualRefund }),
        key,
      ])
      .catch(() => undefined);

    await ghiNhatKy(req, {
      doi_tuong: "order",
      doi_tuong_id: orderId,
      hanh_dong: "huy_don",
      truoc: { status: order.status, thanh_toan_trang_thai: md.thanh_toan_trang_thai ?? null },
      sau: { status: "canceled", paid_amount: money.paid, needs_manual_refund: needsManualRefund },
      ghi_chu: b.reason ?? null,
    });

    return {
      status: 200,
      body: {
        ok: true,
        mode: "cancel",
        already: false,
        display_id: order.display_id,
        paid_amount: money.paid,
        captured_amount: money.captured,
        refunded_before: money.refunded,
        needs_manual_refund: needsManualRefund,
        canh_bao: canhBao,
      },
    };
  };

  try {
    const r = await withOrderPaymentLock(req.scope, orderId, job);
    const out: Out = !r.lockFailed
      ? r.value
      : r.reason === "timeout"
        ? inProgress
        : { status: 500, body: { error: "Hệ thống khoá đơn đang gặp sự cố, vui lòng thử lại sau.", code: "lock_error" } };
    return res.status(out.status).json(out.body);
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    logger.error(`[refund-order] Lỗi đơn ${orderId}: ${msg}`);
    const out = await fail(500, msg, "internal_error");
    return res.status(out.status).json(out.body);
  }
}
