import job from "../revenue-report";

const graph = jest.fn();
const raw = jest.fn();
const container: any = {
  resolve: (k: string) => (k === "query" ? { graph } : k === "__pg_connection__" ? { raw } : { info: jest.fn(), warn: jest.fn() }),
};

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date("2026-10-23T11:00:00Z")); // 18:00 VN
  graph.mockReset();
  raw.mockReset();
  raw.mockResolvedValue({ rows: [] });
  graph.mockResolvedValue({
    data: [
      { id: "a", total: 100, status: "pending", metadata: { thanh_toan_trang_thai: "da_thanh_toan" }, currency_code: "vnd", items: [{ title: "V", quantity: 2 }] },
      { id: "b", total: 40, status: "canceled", metadata: {}, items: [] },
    ],
  });
});
afterEach(() => jest.useRealTimers());

describe("revenue-report job", () => {
  it("tổng hợp hôm nay theo giờ VN và ghi ai_outbox đủ trường", async () => {
    await job(container);
    expect(graph.mock.calls[0][0].filters.created_at).toEqual({
      $gte: "2026-10-22T17:00:00.000Z", $lte: "2026-10-23T11:00:00.000Z",
    });
    const ins = raw.mock.calls.find((c) => String(c[0]).startsWith("INSERT"))!;
    expect(ins[1][0]).toBe("bao_cao_doanh_thu");
    expect(ins[1][1]).toBe("revenue-2026-10-23");
    expect(ins[1][3]).toBe("CHO");
    expect(JSON.parse(ins[1][2])).toMatchObject({
      period: "today", from: "2026-10-22T17:00:00.000Z", to: "2026-10-23T11:00:00.000Z",
      timezone: "Asia/Ho_Chi_Minh", order_count: 1, paid_order_count: 1, revenue_all: 100, revenue_paid: 100,
      canceled_count: 1, pending_count: 1, revenue_pending: 100, excludes_canceled: true, currency: "VND",
      top_products: [{ name: "V", qty: 2 }],
    });
  });

  it("tham_chieu theo ngày VN: 20:00 UTC đã là ngày hôm sau", async () => {
    jest.setSystemTime(new Date("2026-10-23T20:00:00Z"));
    await job(container);
    expect(raw.mock.calls.find((c) => String(c[0]).startsWith("INSERT"))![1][1]).toBe("revenue-2026-10-24");
  });

  it("đã có báo cáo cùng ngày: không chèn thêm", async () => {
    raw.mockResolvedValue({ rows: [{ id: "x" }] });
    await job(container);
    expect(raw.mock.calls.some((c) => String(c[0]).startsWith("INSERT"))).toBe(false);
  });

  it("lỗi query: không ném, không chèn", async () => {
    graph.mockRejectedValue(new Error("boom"));
    await expect(job(container)).resolves.toBeUndefined();
    expect(raw).not.toHaveBeenCalled();
  });
});
