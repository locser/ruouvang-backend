import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import * as crypto from "crypto";
import { checkAuth } from "../../../lib/ai-auth";
import { ghiNhatKy } from "../../../lib/nhat-ky";
import {
  PAYMENT_FIELDS,
  capturePayments,
  claimActionLog,
  withOrderPaymentLock,
} from "../../../lib/order-locks";

/**
 * Nhân viên xác nhận ĐÃ NHẬN TIỀN CHUYỂN KHOẢN cho một đơn (qua chatbot Telegram).
 * TÁCH RIÊNG với "duyệt hoàn thành" (/ai/order-complete): route này chỉ thu tiền
 * (capture) và ghi metadata, KHÔNG xuất kho, KHÔNG đóng đơn.
 *
 * POST /ai/order-payment-received   Body: { order_id: string }
 *
 * Mã `code` (máy đọc): unauthorized, missing_order_id, order_not_found,
 * order_canceled, order_status_invalid, order_is_cod, order_payment_state_invalid, in_progress, capture_failed, metadata_update_failed, internal_error.
 *
 * Chống bấm trùng: khoá theo đơn (Modules.LOCKING, dùng chung với hoan-thanh-don) +
 * upsert nguyên tử trên ai_action_log. Chỉ nhận đơn chuyển khoản (thanh_toan_trang_thai
 * = cho_chuyen_khoan, hoặc chưa có nhãn và phuong_thuc_thanh_toan khác cod).
 */

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res
      .status(401)
      .json({ error: "Unauthorized: Invalid or missing x-ai-secret-key header", code: "unauthorized" });
  }

  const { order_id } = (req.body ?? {}) as { order_id?: string };
  if (!order_id || typeof order_id !== "string") {
    return res.status(400).json({ error: "Thiếu order_id", code: "missing_order_id" });
  }

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const pg = req.scope.resolve("__pg_connection__") as any;
  const key = sha256(`order_payment_received|${order_id}`);

  type Out = { status: number; body: Record<string, unknown> };
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

  const job = async (): Promise<Out> => {
    // Đọc lại đơn BÊN TRONG khoá để có payment và metadata mới nhất.
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "display_id", "status", "metadata", ...PAYMENT_FIELDS],
      filters: { id: order_id },
    });
    const order: any = orders?.[0];
    if (!order) {
      return { status: 404, body: { error: `Không tìm thấy đơn hàng ${order_id}`, code: "order_not_found" } };
    }
    if (order.status === "canceled") {
      return {
        status: 409,
        body: { error: "Đơn hàng đã bị huỷ — không thể xác nhận nhận tiền.", code: "order_canceled" },
      };
    }
    if (order.status !== "pending" && order.status !== "completed") {
      return {
        status: 409,
        body: { error: `Đơn ở trạng thái "${order.status}" — không thể xác nhận nhận tiền.`, code: "order_status_invalid" },
      };
    }
    const md = order.metadata ?? {};
    if (md.thanh_toan_trang_thai === "da_thanh_toan") {
      return { status: 200, body: { ok: true, already: true } };
    }
    const nhan = md.thanh_toan_trang_thai;
    const laCod = nhan === "cod" || (nhan == null && md.phuong_thuc_thanh_toan === "cod");
    if (laCod) {
      return {
        status: 409,
        body: { error: "Đơn COD thu tiền khi giao, không xác nhận chuyển khoản", code: "order_is_cod" },
      };
    }
    if (nhan != null && nhan !== "cho_chuyen_khoan") {
      return {
        status: 409,
        body: { error: "Đơn không ở trạng thái chờ chuyển khoản", code: "order_payment_state_invalid" },
      };
    }

    // ---- Giành quyền chạy (upsert nguyên tử) ----
    try {
      const c = await claimActionLog(pg, key, "order_payment_received", { order_id }, { rerunDone: true });
      if (!c.acquired) return inProgress;
      claimed = true;
    } catch (e: any) {
      logger.error(`[order-payment-received] Không ghi được nhật ký idempotency: ${e?.message ?? e}`);
      return { status: 500, body: { error: "Không khởi tạo được phiên xác nhận tiền", code: "internal_error" } };
    }

    // ---- Capture ----
    const payments: any[] = (order.payment_collections ?? []).flatMap((pc: any) => pc.payments ?? []).filter(Boolean);
    const canhBao: string[] = [];
    const cap = await capturePayments(req.scope, payments);
    if (cap.failed.length > 0) {
      const f = cap.failed[0];
      logger.error(`[order-payment-received] Không capture được payment ${f.id} (đơn ${order_id}): ${f.message}`);
      return fail(502, `Không thu được tiền (capture) cho đơn ${order.display_id ?? order_id}: ${f.message}`, "capture_failed");
    }
    if (cap.total === 0) {
      canhBao.push("Đơn không có giao dịch thanh toán trong hệ thống");
    }

    // ---- Ghi metadata (merge trên metadata vừa đọc trong khoá) ----
    const xacNhanLuc = new Date().toISOString();
    try {
      const orderModule: any = req.scope.resolve(Modules.ORDER);
      await orderModule.updateOrders([
        {
          id: order_id,
          metadata: { ...md, thanh_toan_trang_thai: "da_thanh_toan", thanh_toan_xac_nhan_luc: xacNhanLuc },
        },
      ]);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      logger.error(`[order-payment-received] Không lưu được metadata đơn ${order_id}: ${msg}`);
      return fail(500, `Đã thu tiền nhưng không lưu được trạng thái đơn, hãy bấm lại: ${msg}`, "metadata_update_failed");
    }

    await pg
      .raw("UPDATE ai_action_log SET trang_thai = ?, ket_qua = ?, xong_luc = now() WHERE idempotency_key = ?", [
        "XONG",
        JSON.stringify({ order_id, captured_payments: cap.captured, thanh_toan_xac_nhan_luc: xacNhanLuc }),
        key,
      ])
      .catch(() => undefined);

    await ghiNhatKy(req, {
      doi_tuong: "order",
      doi_tuong_id: order_id,
      hanh_dong: "xac_nhan_nhan_tien",
      truoc: { thanh_toan_trang_thai: nhan ?? null },
      sau: { thanh_toan_trang_thai: "da_thanh_toan", captured_payments: cap.captured },
      ghi_chu: canhBao.join("; ") || null,
    });

    return {
      status: 200,
      body: { ok: true, already: false, display_id: order.display_id, captured_payments: cap.captured.length, canh_bao: canhBao },
    };
  };

  try {
    const r = await withOrderPaymentLock(req.scope, order_id, job);
    const out = r.lockFailed ? inProgress : r.value;
    return res.status(out.status).json(out.body);
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    logger.error(`[order-payment-received] Lỗi đơn ${order_id}: ${msg}`);
    const out = await fail(500, msg, "internal_error");
    return res.status(out.status).json(out.body);
  }
}
