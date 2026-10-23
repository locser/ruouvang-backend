const mockRun = jest.fn();
jest.mock("@medusajs/medusa/core-flows", () => ({
  capturePaymentWorkflow: () => ({ run: mockRun }),
}));
jest.mock("../../../../lib/nhat-ky", () => ({ ghiNhatKy: jest.fn() }));

import { POST } from "../route";

const SECRET = "test-secret-123";
const graph = jest.fn();
const raw = jest.fn();
const updateOrders = jest.fn();
const lockExecute = jest.fn();
let hasLocking = true;

function run(body: any = { order_id: "o1" }, headers: any = { "x-ai-secret-key": SECRET }) {
  const req: any = {
    headers,
    body,
    scope: {
      resolve: (k: string) => {
        if (k === "query") return { graph };
        if (k === "__pg_connection__") return { raw };
        if (k === "order") return { updateOrders };
        if (k === "locking") {
          if (!hasLocking) throw new Error("not registered");
          return { execute: lockExecute };
        }
        return { error: jest.fn(), info: jest.fn() };
      },
    },
  };
  const out: { code: number; body: any } = { code: 0, body: null };
  const res: any = {
    status(c: number) { out.code = c; return res; },
    json(b: unknown) { out.body = b; return res; },
  };
  return POST(req, res).then(() => out);
}

const order = (over: any = {}) => ({
  id: "o1", display_id: 7, status: "pending", metadata: { thanh_toan_trang_thai: "cho_chuyen_khoan", kenh_dat_hang: "chatbot" },
  payment_collections: [{ id: "pc", payments: [{ id: "p1", captured_at: null }] }],
  ...over,
});
const sqlLog = () => raw.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  process.env.CONFIG_INTERNAL_SERVICE_KEY = SECRET;
  [graph, raw, updateOrders, mockRun, lockExecute].forEach((m) => m.mockReset());
  hasLocking = true;
  lockExecute.mockImplementation(async (_k: string, job: () => Promise<unknown>) => job());
  graph.mockResolvedValue({ data: [order()] });
  // Mặc định: upsert giành được quyền chạy.
  raw.mockImplementation(async (sql: string) => (sql.includes("RETURNING") ? { rows: [{ id: "x" }] } : { rows: [] }));
  mockRun.mockResolvedValue({});
  updateOrders.mockResolvedValue([]);
});

describe("POST /ai/order-payment-received", () => {
  it("401 khi sai khoá", async () => {
    const r = await run({ order_id: "o1" }, {});
    expect(r.code).toBe(401);
    expect(r.body.code).toBe("unauthorized");
  });

  it("400 khi thiếu order_id", async () => {
    const r = await run({});
    expect(r.code).toBe(400);
    expect(r.body.code).toBe("missing_order_id");
  });

  it("404 khi không có đơn", async () => {
    graph.mockResolvedValue({ data: [] });
    const r = await run();
    expect(r.code).toBe(404);
    expect(r.body.code).toBe("order_not_found");
  });

  it("409 order_canceled, không capture", async () => {
    graph.mockResolvedValue({ data: [order({ status: "canceled" })] });
    const r = await run();
    expect(r.code).toBe(409);
    expect(r.body.code).toBe("order_canceled");
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("đã da_thanh_toan: 200 already, không làm gì", async () => {
    graph.mockResolvedValue({ data: [order({ metadata: { thanh_toan_trang_thai: "da_thanh_toan" } })] });
    const r = await run();
    expect(r.code).toBe(200);
    expect(r.body).toEqual({ ok: true, already: true });
    expect(mockRun).not.toHaveBeenCalled();
    expect(updateOrders).not.toHaveBeenCalled();
    expect(raw).not.toHaveBeenCalled();
  });

  it("thành công: capture payment chưa thu, merge metadata", async () => {
    const r = await run();
    expect(r.code).toBe(200);
    expect(r.body).toEqual({ ok: true, already: false, display_id: 7, captured_payments: 1, canh_bao: [] });
    expect(mockRun).toHaveBeenCalledWith({ input: { payment_id: "p1" } });
    const md = updateOrders.mock.calls[0][0][0].metadata;
    expect(md.thanh_toan_trang_thai).toBe("da_thanh_toan");
    expect(md.kenh_dat_hang).toBe("chatbot");
    expect(new Date(md.thanh_toan_xac_nhan_luc).toISOString()).toBe(md.thanh_toan_xac_nhan_luc);
    expect(sqlLog().some((s) => s.startsWith("UPDATE"))).toBe(true);
  });

  it("payment đã capture từ trước: không capture lại nhưng vẫn ghi metadata", async () => {
    graph.mockResolvedValue({ data: [order({ payment_collections: [{ id: "pc", payments: [{ id: "p1", captured_at: "2026-01-01" }] }] })] });
    const r = await run();
    expect(r.code).toBe(200);
    expect(mockRun).not.toHaveBeenCalled();
    expect(updateOrders).toHaveBeenCalled();
  });

  it("capture lỗi: 502 capture_failed, không đổi metadata, nhật ký LOI", async () => {
    mockRun.mockRejectedValue(new Error("boom"));
    const r = await run();
    expect(r.code).toBe(502);
    expect(r.body.code).toBe("capture_failed");
    expect(updateOrders).not.toHaveBeenCalled();
    expect(raw.mock.calls.some((c) => String(c[0]).startsWith("UPDATE") && c[1][0] === "LOI")).toBe(true);
  });

  it("upsert không giành được (đang chạy): 409 in_progress, không capture", async () => {
    raw.mockImplementation(async (sql: string) =>
      sql.includes("RETURNING") ? { rows: [] } : { rows: [{ trang_thai: "DANG_CHAY", ket_qua: null }] });
    const r = await run();
    expect(r.code).toBe(409);
    expect(r.body.code).toBe("in_progress");
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("dùng một câu upsert nguyên tử, không DELETE", async () => {
    await run();
    const up = sqlLog().find((s) => s.includes("ON CONFLICT"))!;
    expect(up).toContain("RETURNING id");
    expect(up).toContain("interval '5 minutes'");
    expect(sqlLog().some((s) => s.startsWith("DELETE"))).toBe(false);
  });

  it("khoá theo đơn: execute với key order-payment:<id>", async () => {
    await run();
    expect(lockExecute.mock.calls[0][0]).toBe("order-payment:o1");
  });

  it("không vào được khoá: 409 in_progress, không đọc đơn", async () => {
    lockExecute.mockRejectedValue(new Error("Timed-out acquiring lock."));
    const r = await run();
    expect(r.code).toBe(409);
    expect(r.body.code).toBe("in_progress");
    expect(graph).not.toHaveBeenCalled();
  });

  it("lỗi provider khoá: 500 lock_error, không nói đang xử lý", async () => {
    lockExecute.mockRejectedValue(new Error("redis down"));
    const r = await run();
    expect(r.code).toBe(500);
    expect(r.body.code).toBe("lock_error");
    expect(graph).not.toHaveBeenCalled();
  });

  it("không có module locking: fallback chạy không khoá", async () => {
    hasLocking = false;
    const r = await run();
    expect(r.code).toBe(200);
    expect(lockExecute).not.toHaveBeenCalled();
  });

  it("đơn COD (nhãn cod): 409 order_is_cod", async () => {
    graph.mockResolvedValue({ data: [order({ metadata: { thanh_toan_trang_thai: "cod", phuong_thuc_thanh_toan: "cod" } })] });
    const r = await run();
    expect(r.code).toBe(409);
    expect(r.body.code).toBe("order_is_cod");
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("đơn cũ không nhãn: cod chặn, chuyển khoản cho qua", async () => {
    graph.mockResolvedValue({ data: [order({ metadata: { phuong_thuc_thanh_toan: "cod" } })] });
    expect((await run()).body.code).toBe("order_is_cod");
    graph.mockResolvedValue({ data: [order({ metadata: { phuong_thuc_thanh_toan: "chuyen-khoan" } })] });
    expect((await run()).code).toBe(200);
  });

  it("nhãn lạ: 409 order_payment_state_invalid", async () => {
    graph.mockResolvedValue({ data: [order({ metadata: { thanh_toan_trang_thai: "x" } })] });
    expect((await run()).body.code).toBe("order_payment_state_invalid");
  });

  it.each(["draft", "archived", "requires_action"])("status %s: 409 order_status_invalid", async (st) => {
    graph.mockResolvedValue({ data: [order({ status: st })] });
    const r = await run();
    expect(r.code).toBe(409);
    expect(r.body.code).toBe("order_status_invalid");
  });

  it("status completed vẫn nhận", async () => {
    graph.mockResolvedValue({ data: [order({ status: "completed" })] });
    expect((await run()).code).toBe(200);
  });

  it("không có payment: vẫn ghi, captured_payments 0 kèm canh_bao", async () => {
    graph.mockResolvedValue({ data: [order({ payment_collections: [] })] });
    const r = await run();
    expect(r.code).toBe(200);
    expect(r.body.captured_payments).toBe(0);
    expect(r.body.canh_bao).toEqual(["Đơn không có giao dịch thanh toán trong hệ thống"]);
    expect(updateOrders).toHaveBeenCalled();
  });

  it("bỏ qua payment đã huỷ; capture phần còn lại của payment thu một phần", async () => {
    graph.mockResolvedValue({ data: [order({ payment_collections: [{ id: "pc", payments: [
      { id: "pc1", canceled_at: "2026-01-01", captured_at: null },
      { id: "p2", amount: 100, captured_at: null, captures: [{ amount: 30 }] },
    ] }] })] });
    const r = await run();
    expect(r.code).toBe(200);
    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(mockRun).toHaveBeenCalledWith({ input: { payment_id: "p2", amount: 70 } });
  });

  it("metadata ghi theo bản đọc trong khoá (merge, không mất khoá khác)", async () => {
    graph.mockResolvedValue({ data: [order({ metadata: { thanh_toan_trang_thai: "cho_chuyen_khoan", tracking_code: "T1" } })] });
    await run();
    expect(updateOrders.mock.calls[0][0][0].metadata.tracking_code).toBe("T1");
  });

  it("lưu metadata lỗi: 500 metadata_update_failed", async () => {
    updateOrders.mockRejectedValue(new Error("db"));
    const r = await run();
    expect(r.code).toBe(500);
    expect(r.body.code).toBe("metadata_update_failed");
  });
});
