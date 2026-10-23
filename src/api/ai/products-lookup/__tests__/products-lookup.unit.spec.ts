const mockQuery = jest.fn();
jest.mock("pg", () => ({ Pool: jest.fn(() => ({ query: (...a: any[]) => mockQuery(...a) })) }));
import { POST } from "../route";

const SECRET = "test-secret-123";
function run(body: any) {
  const req: any = { headers: { "x-ai-secret-key": SECRET }, body };
  const out: { code: number; body: any } = { code: 0, body: null };
  const res: any = { status(c: number) { out.code = c; return res; }, json(b: unknown) { out.body = b; return res; } };
  return POST(req, res).then(() => out);
}

beforeEach(() => {
  process.env.CONFIG_INTERNAL_SERVICE_KEY = SECRET;
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [] });
});

describe("POST /ai/products-lookup status", () => {
  it("mặc định published (như cũ)", async () => {
    await run({ ids: ["p1"] });
    expect(mockQuery.mock.calls[0][1]).toEqual([["p1"], [], "published"]);
    expect(mockQuery.mock.calls[0][0]).toContain("$3::text = 'all' OR p.status = $3::text");
  });
  it.each(["draft", "all", "published"])("status %s được chuyển xuống SQL", async (st) => {
    await run({ skus: ["S"], status: st });
    expect(mockQuery.mock.calls[0][1][2]).toBe(st);
  });
  it("status lạ -> 400 invalid_status, không query", async () => {
    const r = await run({ ids: ["p1"], status: "archived" });
    expect(r.code).toBe(400);
    expect(r.body.code).toBe("invalid_status");
    expect(mockQuery).not.toHaveBeenCalled();
  });
  it("thiếu ids/skus vẫn 400", async () => {
    expect((await run({ status: "all" })).code).toBe(400);
  });
});

describe("POST /ai/products-lookup giá gốc", () => {
  it("SQL chỉ join giá VND gốc: không price list, rules_count = 0", async () => {
    await run({ ids: ["p1"] });
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain("pr.price_list_id IS NULL");
    expect(sql).toContain("pr.rules_count = 0");
    expect(sql).toContain("pr.deleted_at IS NULL");
  });
});
