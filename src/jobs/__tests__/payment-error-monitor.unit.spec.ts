import job from "../payment-error-monitor";

const graph = jest.fn();
const raw = jest.fn();
const container: any = {
  resolve: (k: string) => (k === "query" ? { graph } : k === "__pg_connection__" ? { raw } : { info: jest.fn(), warn: jest.fn() }),
};
const NOW = new Date("2026-10-23T11:00:00Z");
const recent = new Date(NOW.getTime() - 2 * 60 * 1000).toISOString();
const old = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  graph.mockReset();
  raw.mockReset();
  raw.mockResolvedValue({ rows: [] });
});
afterEach(() => jest.useRealTimers());

describe("payment-error-monitor", () => {
  it("fields không có payment_status; lọc updated_at; sample có reason", async () => {
    graph.mockResolvedValue({
      data: [
        { display_id: 1, status: "canceled", canceled_at: recent },
        { display_id: 2, status: "canceled", canceled_at: recent },
        { display_id: 3, status: "pending", payment_collections: [{ status: "failed" }] },
        { display_id: 4, status: "pending", payment_collections: [{ status: "canceled" }] },
        { display_id: 5, status: "canceled", canceled_at: old }, // huỷ từ lâu, chỉ cập nhật gần đây
        { display_id: 6, status: "pending", payment_collections: [{ status: "authorized" }] },
      ],
    });
    await job(container);
    const args = graph.mock.calls[0][0];
    expect(args.fields).not.toContain("payment_status");
    expect(args.fields).toEqual(expect.arrayContaining(["canceled_at", "payment_collections.status"]));
    expect(args.filters.updated_at.$gte).toBeDefined();
    const ins = raw.mock.calls.find((c) => String(c[0]).startsWith("INSERT"))!;
    expect(ins[1][0]).toBe("canh_bao_loi_thanh_toan");
    const d = JSON.parse(ins[1][2]);
    expect(d.count).toBe(4);
    expect(d.sample).toEqual([
      { display_id: 1, status: "canceled", reason: "huy" },
      { display_id: 2, status: "canceled", reason: "huy" },
      { display_id: 3, status: "pending", reason: "thanh_toan_loi" },
      { display_id: 4, status: "pending", reason: "thanh_toan_loi" },
    ]);
  });

  it("<= 3 vấn đề: không chèn", async () => {
    graph.mockResolvedValue({ data: [{ display_id: 1, status: "canceled", canceled_at: recent }] });
    await job(container);
    expect(raw).not.toHaveBeenCalled();
  });

  it("đã cảnh báo trong 10 phút: không chèn thêm", async () => {
    graph.mockResolvedValue({ data: [1, 2, 3, 4].map((i) => ({ display_id: i, status: "canceled", canceled_at: recent })) });
    raw.mockResolvedValue({ rows: [{ id: "x" }] });
    await job(container);
    expect(raw.mock.calls.some((c) => String(c[0]).startsWith("INSERT"))).toBe(false);
  });
});
