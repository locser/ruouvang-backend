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
  it("đơn huỷ trong cửa sổ + payment_collection failed; không báo nhầm đơn huỷ cũ hay collection canceled", async () => {
    graph.mockImplementation(async ({ entity }: any) => {
      if (entity === "order") {
        return { data: [
          { id: "o1", display_id: 1, status: "canceled", canceled_at: recent },
          { id: "o2", display_id: 2, status: "canceled", canceled_at: recent },
          { id: "o5", display_id: 5, status: "canceled", canceled_at: old }, // huỷ từ lâu, chỉ cập nhật gần đây
          { id: "o6", display_id: 6, status: "pending", payment_collections: [{ status: "canceled" }] },
        ] };
      }
      return { data: [
        { id: "pc1", status: "failed", order: { id: "o3", display_id: 3, status: "pending" } },
        { id: "pc2", status: "failed", order: { id: "o1", display_id: 1, status: "canceled" } }, // trùng đơn huỷ
        { id: "pc3", status: "failed", order: null },
      ] };
    });
    await job(container);
    const oq = graph.mock.calls.find((c) => c[0].entity === "order")![0];
    expect(oq.fields).not.toContain("payment_status");
    expect(oq.fields).not.toContain("payment_collections.status");
    expect(oq.filters.updated_at.$gte).toBeDefined();
    const pq = graph.mock.calls.find((c) => c[0].entity === "payment_collection")![0];
    expect(pq.filters.status).toBe("failed");
    expect(pq.filters.updated_at.$gte).toBeDefined();
    const ins = raw.mock.calls.find((c) => String(c[0]).startsWith("INSERT"))!;
    expect(ins[1][0]).toBe("canh_bao_loi_thanh_toan");
    const d = JSON.parse(ins[1][2]);
    expect(d.count).toBe(4);
    expect(d.sample).toEqual([
      { display_id: 1, status: "canceled", reason: "huy" },
      { display_id: 2, status: "canceled", reason: "huy" },
      { display_id: 3, status: "pending", reason: "thanh_toan_loi" },
      { display_id: null, status: "failed", reason: "thanh_toan_loi" },
    ]);
  });

  it("chỉ đơn huỷ có collection canceled (<=3): không chèn", async () => {
    graph.mockImplementation(async ({ entity }: any) =>
      entity === "order"
        ? { data: [1, 2, 3].map((i) => ({ id: `o${i}`, display_id: i, status: "canceled", canceled_at: old })) }
        : { data: [] });
    await job(container);
    expect(raw).not.toHaveBeenCalled();
  });

  it("query payment_collection lỗi: vẫn xử lý phần đơn huỷ, không ném", async () => {
    graph.mockImplementation(async ({ entity }: any) => {
      if (entity === "payment_collection") throw new Error("no link");
      return { data: [1, 2, 3, 4].map((i) => ({ id: `o${i}`, display_id: i, status: "canceled", canceled_at: recent })) };
    });
    await expect(job(container)).resolves.toBeUndefined();
    expect(raw.mock.calls.some((c) => String(c[0]).startsWith("INSERT"))).toBe(true);
  });

  it("đã cảnh báo trong 10 phút: không chèn thêm", async () => {
    graph.mockImplementation(async ({ entity }: any) =>
      entity === "order" ? { data: [1, 2, 3, 4].map((i) => ({ id: `o${i}`, display_id: i, status: "canceled", canceled_at: recent })) } : { data: [] });
    raw.mockResolvedValue({ rows: [{ id: "x" }] });
    await job(container);
    expect(raw.mock.calls.some((c) => String(c[0]).startsWith("INSERT"))).toBe(false);
  });
});
