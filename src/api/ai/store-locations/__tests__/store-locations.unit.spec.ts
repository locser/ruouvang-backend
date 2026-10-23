import { GET } from "../route";

const SECRET = "test-secret-123";
const graph = jest.fn();

function run(headers: Record<string, string> = { "x-ai-secret-key": SECRET }) {
  const req: any = {
    headers,
    query: {},
    scope: {
      resolve: (k: string) => (k === "query" ? { graph } : { error: jest.fn() }),
    },
  };
  const out: { code: number; body: any } = { code: 0, body: null };
  const res: any = {
    status(c: number) { out.code = c; return res; },
    json(b: unknown) { out.body = b; return res; },
  };
  return GET(req, res).then(() => out);
}

beforeEach(() => {
  process.env.CONFIG_INTERNAL_SERVICE_KEY = SECRET;
  graph.mockReset();
});

describe("GET /ai/store-locations", () => {
  it("401 khi sai secret", async () => {
    const r = await run({ "x-ai-secret-key": "sai" });
    expect(r.code).toBe(401);
    expect(graph).not.toHaveBeenCalled();
  });

  it("opt-in: chỉ trả location show_to_customer, có address_1; ghép địa chỉ, sắp xếp, kiểm tra maps_url", async () => {
    graph.mockResolvedValue({
      data: [
        { id: "sl_c", name: "B Chi nhánh", metadata: { show_to_customer: true }, address: { address_1: "1 A", address_2: " ", city: "HCM", province: "", phone: "090" } },
        { id: "sl_a", name: "Z Chi nhánh", metadata: { show_to_customer: "true", sort_order: "1", opening_hours: "8-22", maps_url: "https://maps.test/x" }, address: { address_1: "2 B", address_2: "P3", city: "HN", province: "HN" } },
        { id: "sl_kho", name: "Kho chính", metadata: {}, address: { address_1: "Kho", city: "HCM" } },
        { id: "sl_kho2", name: "Kho Trung Tâm", metadata: null, address: { address_1: "Kho 2" } },
        { id: "sl_false", name: "Tắt", metadata: { show_to_customer: "false" }, address: { address_1: "x" } },
        { id: "sl_noaddr", name: "Thiếu địa chỉ", metadata: { show_to_customer: true }, address: null },
        { id: "sl_blank", name: "Địa chỉ trống", metadata: { show_to_customer: true }, address: { address_1: "  ", city: "HCM" } },
        { id: "sl_hidden_old", name: "Cũ", metadata: { hidden: true, show_to_customer: true, sort_order: 0, maps_url: "javascript:alert(1)" }, address: { address_1: "9 Z" } },
      ],
    });
    const r = await run();
    expect(graph.mock.calls[0][0].entity).toBe("stock_location");
    expect(graph.mock.calls[0][0].fields).toEqual(expect.arrayContaining(["address.*", "metadata"]));
    expect(r.code).toBe(200);
    expect(r.body.stores.map((s: any) => s.id)).toEqual(["sl_hidden_old", "sl_a", "sl_c"]);
    const [d, a, c] = r.body.stores;
    expect(d).toEqual({ id: "sl_hidden_old", name: "Cũ", address: "9 Z", phone: null, opening_hours: null, maps_url: null });
    expect(a.address).toBe("2 B, P3, HN, HN");
    expect(a.opening_hours).toBe("8-22");
    expect(a.maps_url).toBe("https://maps.test/x");
    expect(c.address).toBe("1 A, HCM");
    expect(c.phone).toBe("090");
  });

  it("không location nào bật show_to_customer: danh sách rỗng", async () => {
    graph.mockResolvedValue({ data: [{ id: "k", name: "Kho chính", metadata: {}, address: { address_1: "1" } }] });
    const r = await run();
    expect(r.body.stores).toEqual([]);
  });

  it("500 tiếng Việt khi query lỗi", async () => {
    graph.mockRejectedValue(new Error("boom"));
    const r = await run();
    expect(r.code).toBe(500);
    expect(r.body.error).toMatch(/chi nhánh/);
  });
});
