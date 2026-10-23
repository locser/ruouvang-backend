const calls: string[] = [];
const mockCapture = jest.fn();
const mockFulfill = jest.fn();
const mockComplete = jest.fn();
jest.mock("@medusajs/medusa/core-flows", () => ({
  capturePaymentWorkflow: () => ({ run: (a: any) => { calls.push("capture"); return mockCapture(a); } }),
  createOrderFulfillmentWorkflow: () => ({ run: (a: any) => { calls.push("fulfill"); return mockFulfill(a); } }),
  completeOrderWorkflow: () => ({ run: (a: any) => { calls.push("complete"); return mockComplete(a); } }),
}));
jest.mock("../nhat-ky", () => ({ ghiNhatKy: jest.fn() }));

import { hoanThanhDon } from "../hoan-thanh-don";

const raw = jest.fn();
const updateOrders = jest.fn();
const lockExecute = jest.fn();
const graph = jest.fn();

const scope = {
  resolve: (k: string) => {
    if (k === "query") return { graph };
    if (k === "__pg_connection__") return { raw };
    if (k === "order") return { updateOrders };
    if (k === "locking") return { execute: lockExecute };
    return { error: jest.fn(), info: jest.fn() };
  },
};
const req: any = { scope };

let orderMain: any;
let paymentsFresh: any[];
let metadataFresh: any;

const sqlOf = () => raw.mock.calls.map((c) => String(c[0]));
const logStates = () => raw.mock.calls.filter((c) => String(c[0]).startsWith("UPDATE")).map((c) => c[1][0]);

beforeEach(() => {
  calls.length = 0;
  [mockCapture, mockFulfill, mockComplete, raw, updateOrders, lockExecute, graph].forEach((m) => m.mockReset());
  mockCapture.mockResolvedValue({});
  mockFulfill.mockResolvedValue({});
  mockComplete.mockResolvedValue({});
  updateOrders.mockResolvedValue([]);
  lockExecute.mockImplementation(async (_k: string, job: () => Promise<unknown>) => job());
  raw.mockImplementation(async (sql: string) => (sql.includes("RETURNING") ? { rows: [{ id: "x" }] } : { rows: [] }));
  orderMain = {
    id: "order_ABCDEFGH12", status: "pending", total: 100, currency_code: "vnd", metadata: { stale: true },
    items: [{ id: "i1", quantity: 2, detail: { quantity: 2, fulfilled_quantity: 0 } }],
  };
  paymentsFresh = [{ id: "p1", amount: 100, captured_at: null }];
  metadataFresh = { thanh_toan_trang_thai: "cho_chuyen_khoan", route_khac: "giu" };
  graph.mockImplementation(async ({ fields }: any) => {
    if (fields.includes("items.*")) return { data: [orderMain] };
    if (fields.includes("payment_collections.payments.amount"))
      return { data: [{ id: orderMain.id, payment_collections: [{ id: "pc", payments: paymentsFresh }] }] };
    return { data: [{ id: orderMain.id, metadata: metadataFresh }] };
  });
});

describe("hoanThanhDon - idempotency", () => {
  it("log XONG: trả kết quả cũ, không chạy workflow nào", async () => {
    raw.mockImplementation(async (sql: string) =>
      sql.includes("RETURNING") ? { rows: [] } : { rows: [{ trang_thai: "XONG", ket_qua: { a: 1 } }] });
    const r = await hoanThanhDon(req, "order_ABCDEFGH12");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, da_xu_ly_truoc_do: true, ket_qua: { a: 1 } });
    expect(calls).toEqual([]);
    expect(graph).not.toHaveBeenCalled();
    expect(lockExecute).not.toHaveBeenCalled();
  });

  it("log DANG_CHAY còn hạn: 409, không chạy gì", async () => {
    raw.mockImplementation(async (sql: string) =>
      sql.includes("RETURNING") ? { rows: [] } : { rows: [{ trang_thai: "DANG_CHAY", ket_qua: null }] });
    const r = await hoanThanhDon(req, "order_ABCDEFGH12");
    expect(r.status).toBe(409);
    expect(calls).toEqual([]);
    expect(graph).not.toHaveBeenCalled();
  });

  it("không ghi được nhật ký: 500, không chạy gì", async () => {
    raw.mockRejectedValue(new Error("db down"));
    const r = await hoanThanhDon(req, "order_ABCDEFGH12");
    expect(r.status).toBe(500);
    expect(calls).toEqual([]);
  });
});

describe("hoanThanhDon - capture trong khoá", () => {
  it("đọc lại payment trong khoá: đã capture thì không capture lại", async () => {
    paymentsFresh = [{ id: "p1", amount: 100, captured_at: "2026-10-23" }];
    const r = await hoanThanhDon(req, "order_ABCDEFGH12");
    expect(r.status).toBe(200);
    expect(calls).not.toContain("capture");
    expect((r.body as any).ket_qua.captured_payment).toBe(true);
    expect((r.body as any).ket_qua.canh_bao).toContain("Payment đã được thu từ trước.");
  });

  it("không giành được khoá ở bước capture: 500 + log LOI, không fulfill/complete", async () => {
    lockExecute.mockRejectedValue(new Error("timeout"));
    const r = await hoanThanhDon(req, "order_ABCDEFGH12");
    expect(r.status).toBe(500);
    expect(calls).toEqual([]);
    expect(logStates()).toEqual(["LOI"]);
    expect((r.body as any).buoc_da_xong).toMatchObject({ captured_payment: false, created_fulfillment: false, completed_order: false });
  });
});

describe("hoanThanhDon - metadata", () => {
  it("ghi lại metadata mới đọc trong khoá, giữ trường route khác ghi, thêm tracking_code + da_thanh_toan", async () => {
    const r = await hoanThanhDon(req, "order_ABCDEFGH12", " MVD1 ");
    expect(r.status).toBe(200);
    const md = updateOrders.mock.calls[0][0][0].metadata;
    expect(md).toEqual({ thanh_toan_trang_thai: "da_thanh_toan", route_khac: "giu", tracking_code: "MVD1" });
    expect(md.stale).toBeUndefined();
  });

  it("mã vận đơn mặc định từ 8 ký tự cuối order_id", async () => {
    await hoanThanhDon(req, "order_ABCDEFGH12");
    expect(updateOrders.mock.calls[0][0][0].metadata.tracking_code).toBe("VPH-DELIVERY-CDEFGH12");
  });

  it("capture không thành công thì không đổi nhãn thanh toán", async () => {
    mockCapture.mockRejectedValue(new Error("x"));
    await hoanThanhDon(req, "order_ABCDEFGH12");
    expect(updateOrders.mock.calls[0][0][0].metadata.thanh_toan_trang_thai).toBe("cho_chuyen_khoan");
  });
});

describe("hoanThanhDon - thứ tự bước và buoc_da_xong", () => {
  it("thứ tự thực tế: capture -> fulfill -> complete", async () => {
    const r = await hoanThanhDon(req, "order_ABCDEFGH12");
    expect(calls).toEqual(["capture", "fulfill", "complete"]);
    expect((r.body as any).ket_qua).toMatchObject({ captured_payment: true, created_fulfillment: true, completed_order: true });
    expect(logStates()).toEqual(["XONG"]);
  });

  it("fulfillment lỗi: 500, đã capture, chưa complete, log LOI", async () => {
    mockFulfill.mockRejectedValue(new Error("kho"));
    const r = await hoanThanhDon(req, "order_ABCDEFGH12");
    expect(r.status).toBe(500);
    expect(calls).toEqual(["capture", "fulfill"]);
    expect((r.body as any).buoc_da_xong).toMatchObject({ captured_payment: true, created_fulfillment: false, completed_order: false });
    expect(logStates()).toEqual(["LOI"]);
  });

  it("complete lỗi: 500, đã capture + fulfill", async () => {
    mockComplete.mockRejectedValue(new Error("hoàn thành"));
    const r = await hoanThanhDon(req, "order_ABCDEFGH12");
    expect(r.status).toBe(500);
    expect(calls).toEqual(["capture", "fulfill", "complete"]);
    expect((r.body as any).buoc_da_xong).toMatchObject({ captured_payment: true, created_fulfillment: true, completed_order: false });
    expect(updateOrders).not.toHaveBeenCalled();
  });

  it("capture lỗi: không chặn (chỉ cảnh báo), vẫn fulfill + complete", async () => {
    mockCapture.mockRejectedValue(new Error("ngân hàng"));
    const r = await hoanThanhDon(req, "order_ABCDEFGH12");
    expect(r.status).toBe(200);
    expect(calls).toEqual(["capture", "fulfill", "complete"]);
    const kq = (r.body as any).ket_qua;
    expect(kq.captured_payment).toBe(false);
    expect(kq.canh_bao.join(" ")).toContain("Không capture được payment p1");
  });

  it("đơn đã huỷ: 500, không workflow nào", async () => {
    orderMain.status = "canceled";
    const r = await hoanThanhDon(req, "order_ABCDEFGH12");
    expect(r.status).toBe(500);
    expect(calls).toEqual([]);
  });

  it("đơn không có dòng hàng: lỗi sau capture, không complete", async () => {
    orderMain.items = [];
    const r = await hoanThanhDon(req, "order_ABCDEFGH12");
    expect(r.status).toBe(500);
    expect(calls).toEqual(["capture"]);
  });

  it("đơn đã xuất kho đủ: không fulfill lại", async () => {
    orderMain.items = [{ id: "i1", quantity: 1, detail: { quantity: 1, fulfilled_quantity: 1 } }];
    await hoanThanhDon(req, "order_ABCDEFGH12");
    expect(calls).toEqual(["capture", "complete"]);
  });
});
