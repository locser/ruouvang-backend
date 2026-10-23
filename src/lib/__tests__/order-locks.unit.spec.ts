jest.mock("@medusajs/medusa/core-flows", () => ({ capturePaymentWorkflow: jest.fn() }));
import { amountToCapture, claimActionLog } from "../order-locks";

describe("claimActionLog", () => {
  it("câu upsert nguyên tử đúng tham số; có dòng RETURNING -> acquired", async () => {
    const raw = jest.fn().mockResolvedValue({ rows: [{ id: "x" }] });
    const r = await claimActionLog({ raw }, "k1", "act", { a: 1 }, { rerunDone: false });
    expect(r).toEqual({ acquired: true });
    expect(raw).toHaveBeenCalledTimes(1);
    const [sql, params] = raw.mock.calls[0];
    expect(sql).toContain("ON CONFLICT (idempotency_key) DO UPDATE");
    expect(sql).toContain("tao_luc = now()");
    expect(sql).toContain("RETURNING id");
    expect(sql).toContain("interval '5 minutes'");
    expect(sql).toContain("ai_action_log.trang_thai <> 'XONG'");
    expect(params).toEqual(["k1", "act", JSON.stringify({ a: 1 })]);
  });

  it("rerunDone: true thì không loại trừ XONG", async () => {
    const raw = jest.fn().mockResolvedValue({ rows: [{ id: "x" }] });
    await claimActionLog({ raw }, "k", "a", {}, { rerunDone: true });
    expect(raw.mock.calls[0][0]).not.toContain("<> 'XONG'");
  });

  it("không có dòng: đọc lại trạng thái (đang chạy)", async () => {
    const raw = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ trang_thai: "DANG_CHAY", ket_qua: null }] });
    const r = await claimActionLog({ raw }, "k", "a", {}, { rerunDone: false });
    expect(r).toEqual({ acquired: false, trang_thai: "DANG_CHAY", ket_qua: null });
    expect(String(raw.mock.calls[1][0])).toContain("SELECT");
  });
});

describe("amountToCapture", () => {
  it("đã capture/huỷ: không cần", () => {
    expect(amountToCapture({ captured_at: "x" })).toEqual({ needed: false });
    expect(amountToCapture({ canceled_at: "x" })).toEqual({ needed: false });
  });
  it("chưa thu: cần, không truyền amount; thu một phần: phần còn lại", () => {
    expect(amountToCapture({ amount: 100 })).toEqual({ needed: true });
    expect(amountToCapture({ amount: 100, captures: [{ amount: 40 }] })).toEqual({ needed: true, amount: 60 });
    expect(amountToCapture({ amount: 100, captures: [{ amount: 100 }] })).toEqual({ needed: false });
  });
});
