jest.mock("../../../../lib/nhat-ky", () => ({ ghiNhatKy: jest.fn() }));
import { POST } from "../route";

const SECRET = "test-secret-123";
const graph = jest.fn();
const updatePrices = jest.fn();
const updatePriceSets = jest.fn();
const addPrices = jest.fn();

function run(body: any, headers: any = { "x-ai-secret-key": SECRET }) {
  const req: any = {
    headers, body,
    scope: { resolve: (k: string) => (k === "query" ? { graph } : k === "pricing" ? { updatePrices, updatePriceSets, addPrices } : { error: jest.fn() }) },
  };
  const out: { code: number; body: any } = { code: 0, body: null };
  const res: any = { status(c: number) { out.code = c; return res; }, json(b: unknown) { out.body = b; return res; } };
  return POST(req, res).then(() => out);
}

const variant = (over: any = {}) => ({
  id: "v1", title: "750ml", sku: "S1", product: { id: "p1", title: "Vang A" },
  price_set: { id: "ps1", prices: [
    { id: "pr_vnd", currency_code: "vnd", amount: 500000, min_quantity: null, max_quantity: null, rules_count: 0, price_list_id: null },
    { id: "pr_aud", currency_code: "aud", amount: 40, min_quantity: null, max_quantity: null, rules_count: 0, price_list_id: null },
    { id: "pr_vnd_rule", currency_code: "vnd", amount: 450000, rules_count: 1, price_list_id: null },
    { id: "pr_pl", currency_code: "vnd", amount: 1, rules_count: 0, price_list_id: "plist_1" },
  ] },
  ...over,
});

beforeEach(() => {
  process.env.CONFIG_INTERNAL_SERVICE_KEY = SECRET;
  [graph, updatePrices, updatePriceSets, addPrices].forEach((m) => m.mockReset());
  graph.mockResolvedValue({ data: [variant()] });
});

describe("POST /ai/update-price", () => {
  it("401", async () => {
    const r = await run({ variant_id: "v1", amount_vnd: 1000 }, {});
    expect(r.code).toBe(401);
    expect(r.body.code).toBe("unauthorized");
  });

  it.each([0, -5, 1.5, "100", 1_000_000_001, null, undefined])("amount_vnd %p -> 400 invalid_price", async (v) => {
    const r = await run({ variant_id: "v1", amount_vnd: v });
    expect(r.code).toBe(400);
    expect(r.body.code).toBe("invalid_price");
    expect(graph).not.toHaveBeenCalled();
  });

  it("thiếu variant_id và product_id: 400 invalid_target", async () => {
    expect((await run({ amount_vnd: 1000 })).body.code).toBe("invalid_target");
  });

  it("đặt giá VND: chỉ cập nhật đúng 1 dòng price theo id; không đụng AUD/rule/price list, không gọi updatePriceSets", async () => {
    const r = await run({ variant_id: "v1", amount_vnd: 600000 });
    expect(r.code).toBe(200);
    expect(r.body).toEqual({ ok: true, variant_id: "v1", product_title: "Vang A", variant_title: "750ml", old_price_vnd: 500000, new_price_vnd: 600000 });
    expect(updatePrices).toHaveBeenCalledTimes(1);
    expect(updatePrices).toHaveBeenCalledWith([{ id: "pr_vnd", amount: 600000 }]);
    expect(updatePriceSets).not.toHaveBeenCalled();
    expect(addPrices).not.toHaveBeenCalled();
  });

  it("chưa có giá VND gốc: addPrices (không xoá gì), old_price null", async () => {
    graph.mockResolvedValue({ data: [variant({ price_set: { id: "ps1", prices: [{ id: "pr_aud", currency_code: "aud", amount: 40 }] } })] });
    const r = await run({ variant_id: "v1", amount_vnd: 1000 });
    expect(r.body.old_price_vnd).toBeNull();
    expect(addPrices).toHaveBeenCalledWith({ priceSetId: "ps1", prices: [{ amount: 1000, currency_code: "vnd" }] });
    expect(updatePrices).not.toHaveBeenCalled();
    expect(updatePriceSets).not.toHaveBeenCalled();
  });

  it("variant không tồn tại: 404 variant_not_found", async () => {
    graph.mockResolvedValue({ data: [] });
    const r = await run({ variant_id: "x", amount_vnd: 1000 });
    expect(r.code).toBe(404);
    expect(r.body.code).toBe("variant_not_found");
  });

  it("product_id: 1 variant thì đổi giá; không có sản phẩm: 404 product_not_found", async () => {
    graph.mockImplementation(async ({ entity }: any) => (entity === "product" ? { data: [{ id: "p1" }] } : { data: [variant()] }));
    expect((await run({ product_id: "p1", amount_vnd: 1000 })).code).toBe(200);
    graph.mockImplementation(async ({ entity }: any) => (entity === "product" ? { data: [] } : { data: [] }));
    const r = await run({ product_id: "zz", amount_vnd: 1000 });
    expect(r.code).toBe(404);
    expect(r.body.code).toBe("product_not_found");
  });

  it("product_id nhiều variant: 409 ambiguous_variant kèm danh sách, không ghi giá", async () => {
    graph.mockImplementation(async ({ entity }: any) =>
      entity === "product" ? { data: [{ id: "p1" }] } : { data: [variant(), variant({ id: "v2", title: "1.5L", sku: "S2", price_set: { id: "ps2", prices: [] } })] });
    const r = await run({ product_id: "p1", amount_vnd: 1000 });
    expect(r.code).toBe(409);
    expect(r.body.code).toBe("ambiguous_variant");
    expect(r.body.variants).toEqual([
      { id: "v1", title: "750ml", sku: "S1", price_vnd: 500000 },
      { id: "v2", title: "1.5L", sku: "S2", price_vnd: null },
    ]);
    expect(updatePrices).not.toHaveBeenCalled();
  });

  it("module giá lỗi: 500 internal_error", async () => {
    updatePrices.mockRejectedValue(new Error("db"));
    const r = await run({ variant_id: "v1", amount_vnd: 1000 });
    expect(r.code).toBe(500);
    expect(r.body.code).toBe("internal_error");
  });
});
