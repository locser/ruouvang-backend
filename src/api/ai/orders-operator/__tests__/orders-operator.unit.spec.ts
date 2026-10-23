import { GET } from "../route";

const SECRET = "test-secret-123";
const graph = jest.fn();

function run(query: Record<string, string> = {}) {
  const req: any = {
    headers: { "x-ai-secret-key": SECRET },
    query,
    scope: { resolve: (k: string) => (k === "query" ? { graph } : { error: jest.fn() }) },
  };
  const out: { code: number; body: any } = { code: 0, body: null };
  const res: any = {
    status(c: number) { out.code = c; return res; },
    json(b: unknown) { out.body = b; return res; },
  };
  return GET(req, res).then(() => out);
}

const call = () => graph.mock.calls[0][0];

beforeEach(() => {
  process.env.CONFIG_INTERNAL_SERVICE_KEY = SECRET;
  graph.mockReset();
  graph.mockResolvedValue({ data: [] });
});

describe("GET /ai/orders-operator", () => {
  it("mặc định như cũ: status pending, created_at DESC", async () => {
    await run();
    expect(call().filters).toEqual({ status: "pending" });
    expect(call().pagination.order).toEqual({ created_at: "DESC" });
  });

  it("dùng items.* thay vì chọn lẻ", async () => {
    await run();
    expect(call().fields).toContain("items.*");
    expect(call().fields).not.toContain("items.quantity");
  });

  it("display_id lọc trong filters và bỏ status mặc định", async () => {
    await run({ display_id: "42" });
    expect(call().filters).toEqual({ display_id: 42 });
  });

  it("display_id + status rõ ràng thì lọc cả hai", async () => {
    await run({ display_id: "42", status: "canceled" });
    expect(call().filters).toEqual({ status: "canceled", display_id: 42 });
  });

  it.each(["0", "-3", "1.5", "abc"])("display_id %s -> 400", async (v) => {
    const r = await run({ display_id: v });
    expect(r.code).toBe(400);
    expect(graph).not.toHaveBeenCalled();
  });

  it("order=asc -> ASC; giá trị lạ -> DESC", async () => {
    await run({ order: "asc" });
    expect(call().pagination.order).toEqual({ created_at: "ASC" });
    graph.mockClear();
    await run({ order: "xyz" });
    expect(call().pagination.order).toEqual({ created_at: "DESC" });
  });

  it("map items và trả status null khi không lọc status", async () => {
    graph.mockResolvedValue({
      data: [{ id: "o1", display_id: 42, status: "canceled", total: 100, items: [{ title: "Vang", quantity: 2, unit_price: 50 }] }],
    });
    const r = await run({ display_id: "42" });
    expect(r.body.status).toBeNull();
    expect(r.body.orders[0].status).toBe("canceled");
    expect(r.body.orders[0].items).toEqual([{ title: "Vang", quantity: 2, unit_price_vnd: 50 }]);
  });
});
