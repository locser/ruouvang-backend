const mockCancel = jest.fn();
const mockRefund = jest.fn();
jest.mock("@medusajs/medusa/core-flows", () => ({
  cancelOrderWorkflow: () => ({ run: mockCancel }),
  refundPaymentWorkflow: () => ({ run: mockRefund }),
  capturePaymentWorkflow: jest.fn(),
}));
jest.mock("../../../../lib/nhat-ky", () => ({ ghiNhatKy: jest.fn() }));

import { POST } from "../route";

const SECRET = "test-secret-123";
const graph = jest.fn();
const raw = jest.fn();
const updateOrders = jest.fn();
const lockExecute = jest.fn();
let hasLocking = true;

function run(body: any = { orderId: "o1" }, headers: any = { "x-ai-secret-key": SECRET }) {
  const req: any = {
    headers, body,
    scope: {
      resolve: (k: string) => {
        if (k === "query") return { graph };
        if (k === "__pg_connection__") return { raw };
        if (k === "order") return { updateOrders };
        if (k === "locking") { if (!hasLocking) throw new Error("x"); return { execute: lockExecute }; }
        return { error: jest.fn(), info: jest.fn() };
      },
    },
  };
  const out: { code: number; body: any } = { code: 0, body: null };
  const res: any = { status(c: number) { out.code = c; return res; }, json(b: unknown) { out.body = b; return res; } };
  return POST(req, res).then(() => out);
}

const order = (over: any = {}) => ({
  id: "o1", display_id: 9, status: "pending",
  metadata: { thanh_toan_trang_thai: "cho_chuyen_khoan", kenh: "x" },
  fulfillments: [],
  payment_collections: [{ id: "pc", payments: [{ id: "p1", amount: 500, captured_at: null, captures: [] }] }],
  ...over,
});

beforeEach(() => {
  process.env.CONFIG_INTERNAL_SERVICE_KEY = SECRET;
  [graph, raw, updateOrders, lockExecute, mockCancel, mockRefund].forEach((m) => m.mockReset());
  hasLocking = true;
  lockExecute.mockImplementation(async (_k: string, job: () => Promise<unknown>) => job());
  graph.mockResolvedValue({ data: [order()] });
  raw.mockImplementation(async (sql: string) => (sql.includes("RETURNING") ? { rows: [{ id: "x" }] } : { rows: [] }));
  mockCancel.mockResolvedValue({});
  mockRefund.mockResolvedValue({});
  updateOrders.mockResolvedValue([]);
});

describe("POST /ai/refund-order - huỷ cả đơn", () => {
  it("401 / 400", async () => {
    expect((await run({ orderId: "o1" }, {})).body.code).toBe("unauthorized");
    const r = await run({});
    expect(r.code).toBe(400);
    expect(r.body.code).toBe("missing_order_id");
  });

  it("nhận cả orderId và order_id", async () => {
    expect((await run({ order_id: "o1" })).code).toBe(200);
    expect(graph.mock.calls[0][0].filters).toEqual({ id: "o1" });
  });

  it("404 order_not_found", async () => {
    graph.mockResolvedValue({ data: [] });
    const r = await run();
    expect(r.code).toBe(404);
    expect(r.body.code).toBe("order_not_found");
  });

  it("đã canceled: 200 already, không huỷ lại", async () => {
    graph.mockResolvedValue({ data: [order({ status: "canceled" })] });
    const r = await run();
    expect(r.body).toEqual({ ok: true, mode: "cancel", already: true, display_id: 9 });
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it("completed: 409 order_completed", async () => {
    graph.mockResolvedValue({ data: [order({ status: "completed" })] });
    const r = await run();
    expect(r.code).toBe(409);
    expect(r.body.code).toBe("order_completed");
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it("có fulfillment chưa huỷ: 409 has_fulfillment; fulfillment đã huỷ thì cho qua", async () => {
    graph.mockResolvedValue({ data: [order({ fulfillments: [{ id: "f1", canceled_at: null }] })] });
    const r = await run();
    expect(r.code).toBe(409);
    expect(r.body.code).toBe("has_fulfillment");
    graph.mockResolvedValue({ data: [order({ fulfillments: [{ id: "f1", canceled_at: "2026-01-01" }] })] });
    expect((await run()).code).toBe(200);
  });

  it("status khác pending: 409 order_status_invalid", async () => {
    graph.mockResolvedValue({ data: [order({ status: "archived" })] });
    const r = await run();
    expect(r.code).toBe(409);
    expect(r.body.code).toBe("order_status_invalid");
  });

  it("đơn chưa thu tiền: huỷ, paid_amount 0, không đổi metadata", async () => {
    const r = await run();
    expect(r.code).toBe(200);
    expect(r.body).toEqual({ ok: true, mode: "cancel", already: false, display_id: 9, paid_amount: 0, needs_manual_refund: false, canh_bao: [] });
    expect(mockCancel).toHaveBeenCalledWith({ input: { order_id: "o1" } });
    expect(updateOrders).not.toHaveBeenCalled();
  });

  it("đã capture: paid_amount = tổng captures, gắn can_hoan_thu_cong, giữ trường khác", async () => {
    graph.mockResolvedValue({ data: [order({
      metadata: { thanh_toan_trang_thai: "da_thanh_toan", kenh: "x" },
      payment_collections: [{ id: "pc", payments: [
        { id: "p1", amount: 500, captured_at: "t", captures: [{ amount: 300 }, { amount: 200 }] },
        { id: "p2", amount: 99, canceled_at: "t", captures: [] },
      ] }],
    })] });
    const r = await run();
    expect(r.body).toMatchObject({ paid_amount: 500, needs_manual_refund: true });
    expect(updateOrders.mock.calls[0][0][0].metadata).toEqual({ thanh_toan_trang_thai: "can_hoan_thu_cong", kenh: "x" });
    expect(mockCancel).toHaveBeenCalled();
  });

  it("nhãn da_thanh_toan dù không có capture: needs_manual_refund true", async () => {
    graph.mockResolvedValue({ data: [order({ metadata: { thanh_toan_trang_thai: "da_thanh_toan" }, payment_collections: [] })] });
    const r = await run();
    expect(r.body).toMatchObject({ paid_amount: 0, needs_manual_refund: true });
  });

  it("huỷ xong nhưng ghi nhãn lỗi: vẫn 200 kèm canh_bao", async () => {
    graph.mockResolvedValue({ data: [order({ payment_collections: [{ id: "pc", payments: [{ id: "p", amount: 5, captured_at: "t", captures: [{ amount: 5 }] }] }] })] });
    updateOrders.mockRejectedValue(new Error("db"));
    const r = await run();
    expect(r.code).toBe(200);
    expect(r.body.needs_manual_refund).toBe(true);
    expect(r.body.canh_bao[0]).toContain("can_hoan_thu_cong");
  });

  it("cancelOrderWorkflow lỗi: 500 internal_error, log LOI, không đổi metadata", async () => {
    mockCancel.mockRejectedValue(new Error("boom"));
    const r = await run();
    expect(r.code).toBe(500);
    expect(r.body.code).toBe("internal_error");
    expect(updateOrders).not.toHaveBeenCalled();
    expect(raw.mock.calls.some((c) => String(c[0]).startsWith("UPDATE") && c[1][0] === "LOI")).toBe(true);
  });

  it("khoá: key order-payment:<id>; timeout -> 409 in_progress; lỗi provider -> 500 lock_error; không locking -> chạy thẳng", async () => {
    await run();
    expect(lockExecute.mock.calls[0][0]).toBe("order-payment:o1");
    lockExecute.mockRejectedValue(new Error("Timed-out acquiring lock."));
    expect((await run()).body.code).toBe("in_progress");
    lockExecute.mockRejectedValue(new Error("redis down"));
    const r = await run();
    expect(r.code).toBe(500);
    expect(r.body.code).toBe("lock_error");
    hasLocking = false;
    expect((await run()).code).toBe(200);
  });

  it("upsert không giành được: 409 in_progress, không huỷ; dùng order_cancel key", async () => {
    raw.mockImplementation(async (sql: string) => (sql.includes("RETURNING") ? { rows: [] } : { rows: [{ trang_thai: "DANG_CHAY" }] }));
    const r = await run();
    expect(r.code).toBe(409);
    expect(r.body.code).toBe("in_progress");
    expect(mockCancel).not.toHaveBeenCalled();
  });
});

describe("POST /ai/refund-order - nhánh partial (hành vi cũ + code)", () => {
  it("hoàn một phần: gọi refundPaymentWorkflow, không huỷ", async () => {
    graph.mockResolvedValue({ data: [{ id: "o1", payment_collections: [{ payments: [{ id: "p1", amount: 500 }] }] }] });
    const r = await run({ orderId: "o1", partial: true, refundAmount: 100, reason: "x" });
    expect(r.body).toMatchObject({ ok: true, mode: "partial_refund" });
    expect(mockRefund).toHaveBeenCalledWith({ input: { payment_id: "p1", amount: 100, note: "x" } });
    expect(mockCancel).not.toHaveBeenCalled();
    expect(lockExecute).not.toHaveBeenCalled();
  });
  it("không có payment: 404 payment_not_found; workflow lỗi: 500 internal_error", async () => {
    graph.mockResolvedValue({ data: [{ id: "o1", payment_collections: [] }] });
    const r = await run({ orderId: "o1", partial: true, refundAmount: 100 });
    expect(r.code).toBe(404);
    expect(r.body.code).toBe("payment_not_found");
    graph.mockResolvedValue({ data: [{ id: "o1", payment_collections: [{ payments: [{ id: "p1" }] }] }] });
    mockRefund.mockRejectedValue(new Error("x"));
    const r2 = await run({ orderId: "o1", partial: true, refundAmount: 100 });
    expect(r2.code).toBe(500);
    expect(r2.body.code).toBe("internal_error");
  });
});
