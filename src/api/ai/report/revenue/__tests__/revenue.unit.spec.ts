import { GET } from "../route";
import { periodRange } from "../../../../../lib/report-period";

const SECRET = "test-secret-123";
const graph = jest.fn();

function run(query: Record<string, string> = {}, headers: any = { "x-ai-secret-key": SECRET }) {
  const req: any = { headers, query, scope: { resolve: () => ({ graph }) } };
  const out: { code: number; body: any } = { code: 0, body: null };
  const res: any = {
    status(c: number) { out.code = c; return res; },
    json(b: unknown) { out.body = b; return res; },
  };
  return GET(req, res).then(() => out);
}

const o = (id: string, total: number, status: string, metadata: any = {}, items: any[] = []) =>
  ({ id, total, status, metadata, currency_code: "vnd", items });

beforeEach(() => {
  process.env.CONFIG_INTERNAL_SERVICE_KEY = SECRET;
  graph.mockReset();
  graph.mockResolvedValue({ data: [] });
});

describe("GET /ai/report/revenue", () => {
  it("401 khi sai khoá", async () => {
    expect((await run({}, {})).code).toBe(401);
  });

  it("contract cũ theo days + trường mới; loại huỷ, đếm huỷ, pending, đã thu theo metadata", async () => {
    graph.mockResolvedValue({
      data: [
        o("a", 100, "pending", { thanh_toan_trang_thai: "da_thanh_toan" }, [{ title: "Vang A", quantity: 2 }]),
        o("b", 300, "pending", { thanh_toan_trang_thai: "cho_chuyen_khoan" }, [{ title: "Vang B", quantity: 1 }]),
        o("c", 1000, "canceled", { thanh_toan_trang_thai: "da_thanh_toan" }, [{ title: "Vang A", quantity: 50 }]),
        o("d", 50, "completed", { thanh_toan_trang_thai: "cod" }),
        o("e", 70, "pending", { phuong_thuc_thanh_toan: "cod" }),
        o("f", 20, "completed", {}),
      ],
    });
    const r = await run({ days: "3" });
    expect(r.code).toBe(200);
    expect(r.body).toMatchObject({
      ok: true, period_days: 3, order_count: 5, paid_order_count: 2,
      revenue_all: 540, revenue_paid: 150, avg_order_value: 108, currency: "VND",
      excludes_canceled: true, canceled_count: 1, pending_count: 3, revenue_pending: 470,
      timezone: "Asia/Ho_Chi_Minh",
    });
    expect(r.body.top_products).toEqual([{ name: "Vang A", qty: 2 }, { name: "Vang B", qty: 1 }]);
    expect(r.body.period).toBeUndefined();
    expect(graph.mock.calls[0][0].fields).toEqual(expect.arrayContaining(["metadata", "items.*"]));
    expect(graph.mock.calls[0][0].fields).not.toContain("payment_status");
    expect(graph.mock.calls[0][0].filters.created_at.$gte).toBe(r.body.since);
  });

  it("period=today: from/to, period_days null, lọc created_at theo from..to", async () => {
    const r = await run({ period: "today" });
    expect(r.code).toBe(200);
    expect(r.body.period).toBe("today");
    expect(r.body.period_days).toBeNull();
    expect(r.body.since).toBe(r.body.from);
    expect(new Date(r.body.from).getTime()).toBeLessThanOrEqual(new Date(r.body.to).getTime());
    expect(graph.mock.calls[0][0].filters.created_at).toEqual({ $gte: r.body.from, $lte: r.body.to });
  });

  it("period lạ -> 400 invalid_period, không query", async () => {
    const r = await run({ period: "yesterday" });
    expect(r.code).toBe(400);
    expect(r.body.code).toBe("invalid_period");
    expect(graph).not.toHaveBeenCalled();
  });
});

describe("periodRange (Asia/Ho_Chi_Minh, UTC+7)", () => {
  it("today: 0h VN = 17:00 UTC hôm trước", () => {
    // 2026-10-23 10:30 UTC = 17:30 VN ngày 23 (thứ Sáu)
    const now = new Date("2026-10-23T10:30:00Z");
    expect(periodRange("today", now)).toEqual({ from: "2026-10-22T17:00:00.000Z", to: now.toISOString() });
  });
  it("today: 18:00 UTC đã sang ngày hôm sau theo giờ VN", () => {
    const now = new Date("2026-10-23T18:00:00Z"); // 01:00 VN ngày 24
    expect(periodRange("today", now).from).toBe("2026-10-23T17:00:00.000Z");
  });
  it("this_week: bắt đầu thứ Hai (23/10/2026 là thứ Sáu -> thứ Hai 19/10)", () => {
    expect(periodRange("this_week", new Date("2026-10-23T10:30:00Z")).from).toBe("2026-10-18T17:00:00.000Z");
  });
  it("this_week: Chủ nhật thuộc tuần bắt đầu thứ Hai trước đó; thứ Hai 0h30 VN", () => {
    expect(periodRange("this_week", new Date("2026-10-25T05:00:00Z")).from).toBe("2026-10-18T17:00:00.000Z");
    expect(periodRange("this_week", new Date("2026-10-18T17:30:00Z")).from).toBe("2026-10-18T17:00:00.000Z"); // 00:30 thứ Hai 19/10 VN
  });
  it("this_week qua ranh giới tháng/năm", () => {
    // 2027-01-01 (thứ Sáu) -> thứ Hai 2026-12-28
    expect(periodRange("this_week", new Date("2027-01-01T03:00:00Z")).from).toBe("2026-12-27T17:00:00.000Z");
  });
  it("this_month: ngày 1 0h VN", () => {
    expect(periodRange("this_month", new Date("2026-10-23T10:30:00Z")).from).toBe("2026-09-30T17:00:00.000Z");
    // 31/10 18:00 UTC = 1/11 01:00 VN -> tháng 11
    expect(periodRange("this_month", new Date("2026-10-31T18:00:00Z")).from).toBe("2026-10-31T17:00:00.000Z");
  });
});
