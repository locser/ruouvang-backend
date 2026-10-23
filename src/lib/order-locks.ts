import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { capturePaymentWorkflow } from "@medusajs/medusa/core-flows";

/**
 * Khoá và nhật ký idempotency dùng chung cho các thao tác tiền của đơn
 * (/ai/order-complete và /ai/order-payment-received).
 */

/** Trường cần đọc để biết payment nào còn phải capture. */
export const PAYMENT_FIELDS = [
  "payment_collections.id",
  "payment_collections.payments.id",
  "payment_collections.payments.amount",
  "payment_collections.payments.captured_at",
  "payment_collections.payments.canceled_at",
  "payment_collections.payments.captures.amount",
];

export const orderPaymentLockKey = (orderId: string) => `order-payment:${orderId}`;

/**
 * Chạy `fn` trong khoá theo đơn (Modules.LOCKING). Khoá chỉ bảo vệ việc
 * capture + ghi metadata, không bao cả quá trình xuất kho.
 *
 * `lockFailed = true` nghĩa là KHÔNG vào được khoá và `fn` chưa chạy. `reason`:
 *   "timeout" = hết thời gian chờ vì nơi khác đang giữ khoá (Medusa ném "Timed-out acquiring lock.");
 *   "error"   = lỗi provider/hạ tầng locking (đã ghi log lỗi gốc), KHÔNG phải do trùng thao tác.
 * Fallback: nếu không resolve được module locking (môi trường test/unit không đăng ký),
 * chạy `fn` thẳng không khoá; khi đó chỉ còn lớp ai_action_log chống trùng.
 */
export async function withOrderPaymentLock<T>(
  scope: { resolve: (k: string) => any },
  orderId: string,
  fn: () => Promise<T>,
  timeoutSeconds = 30
): Promise<{ lockFailed: false; value: T } | { lockFailed: true; reason: "timeout" | "error"; error: string }> {
  let locking: any = null;
  try {
    locking = scope.resolve(Modules.LOCKING);
  } catch {
    locking = null;
  }
  if (!locking?.execute) {
    return { lockFailed: false, value: await fn() };
  }
  let started = false;
  try {
    const value = await locking.execute(
      orderPaymentLockKey(orderId),
      async () => {
        started = true;
        return fn();
      },
      { timeout: timeoutSeconds }
    );
    return { lockFailed: false, value };
  } catch (e) {
    if (started) throw e;
    const error = (e as any)?.message ?? String(e);
    const reason = /timed.?out/i.test(error) ? "timeout" : "error";
    try {
      scope.resolve(ContainerRegistrationKeys.LOGGER).error(
        `[order-locks] Không vào được khoá ${orderPaymentLockKey(orderId)} (${reason}): ${error}`
      );
    } catch {
      /* không có logger thì bỏ qua */
    }
    return { lockFailed: true, reason, error };
  }
}

/** Phần còn phải thu của một payment; null nếu không cần capture (đã thu đủ hoặc đã huỷ). */
export function amountToCapture(p: any): { needed: boolean; amount?: number } {
  if (!p || p.captured_at || p.canceled_at) return { needed: false };
  const daThu = (p.captures ?? []).reduce((s: number, c: any) => s + (Number(c?.amount) || 0), 0);
  if (daThu <= 0) return { needed: true };
  const con = (Number(p.amount) || 0) - daThu;
  return con > 0 ? { needed: true, amount: con } : { needed: false };
}

export interface CaptureOutcome {
  /** Số payment hợp lệ (chưa huỷ). */
  total: number;
  captured: string[];
  failed: { id: string; message: string }[];
  /** Mọi payment hợp lệ đều đã thu đủ (kể cả vừa thu xong). */
  allCaptured: boolean;
}

/** Capture các payment còn thiếu, không ném lỗi: lỗi nằm trong `failed`. */
export async function capturePayments(scope: any, payments: any[]): Promise<CaptureOutcome> {
  const valid = payments.filter((p) => p && !p.canceled_at);
  const out: CaptureOutcome = { total: valid.length, captured: [], failed: [], allCaptured: false };
  for (const p of valid) {
    const need = amountToCapture(p);
    if (!need.needed) continue;
    try {
      await capturePaymentWorkflow(scope).run({
        input: { payment_id: p.id, ...(need.amount !== undefined ? { amount: need.amount } : {}) },
      });
      out.captured.push(p.id);
    } catch (e: any) {
      out.failed.push({ id: p.id, message: e?.message ?? String(e) });
    }
  }
  out.allCaptured = out.failed.length === 0;
  return out;
}

export async function readOrderPayments(scope: any, orderId: string): Promise<any[]> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "metadata", ...PAYMENT_FIELDS],
    filters: { id: orderId },
  });
  const order: any = data?.[0];
  return (order?.payment_collections ?? []).flatMap((pc: any) => pc.payments ?? []).filter(Boolean);
}

export type ClaimResult =
  | { acquired: true }
  | { acquired: false; trang_thai: string | null; ket_qua: unknown };

/**
 * Giành quyền chạy bằng MỘT câu upsert nguyên tử (thay SELECT+DELETE+INSERT).
 * Giành được khi: chưa có dòng, hoặc dòng cũ không phải DANG_CHAY, hoặc DANG_CHAY đã quá 5 phút (treo).
 * `rerunDone = false`: dòng XONG không bị ghi đè (trả kết quả cũ).
 * Không giành được thì đọc lại dòng để người gọi biết là XONG hay đang chạy.
 */
export async function claimActionLog(
  pg: any,
  key: string,
  action: string,
  params: unknown,
  opts: { rerunDone: boolean }
): Promise<ClaimResult> {
  const r = await pg.raw(
    `INSERT INTO ai_action_log (idempotency_key, hanh_dong, tham_so, trang_thai)
     VALUES (?, ?, ?::jsonb, 'DANG_CHAY')
     ON CONFLICT (idempotency_key) DO UPDATE
       SET trang_thai = 'DANG_CHAY', tham_so = EXCLUDED.tham_so, ket_qua = NULL,
           tao_luc = now(), xong_luc = NULL
       WHERE (ai_action_log.trang_thai <> 'DANG_CHAY' OR ai_action_log.tao_luc < now() - interval '5 minutes')
         ${opts.rerunDone ? "" : "AND ai_action_log.trang_thai <> 'XONG'"}
     RETURNING id`,
    [key, action, JSON.stringify(params)]
  );
  if ((r?.rows?.length ?? 0) > 0) return { acquired: true };
  const cu = await pg.raw("SELECT trang_thai, ket_qua FROM ai_action_log WHERE idempotency_key = ?", [key]);
  const row = cu?.rows?.[0];
  return { acquired: false, trang_thai: row?.trang_thai ?? null, ket_qua: row?.ket_qua ?? null };
}
