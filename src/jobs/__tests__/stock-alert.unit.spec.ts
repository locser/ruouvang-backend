import job, { tenHienThi } from "../stock-alert";

const raw = jest.fn();
const container: any = { resolve: (k: string) => (k === "__pg_connection__" ? { raw } : { info: jest.fn(), warn: jest.fn() }) };

beforeEach(() => raw.mockReset());

describe("tenHienThi", () => {
  it("ghép tên sản phẩm - biến thể, bỏ Default/trùng, giữ trường cũ", () => {
    expect(tenHienThi({ sku: "S1", available: 2, product_title: "Vang A", variant_title: "750ml" }))
      .toEqual({ sku: "S1", available: 2, title: "Vang A - 750ml" });
    expect(tenHienThi({ sku: "S", product_title: "Vang A", variant_title: "Default" }).title).toBe("Vang A");
    expect(tenHienThi({ sku: "S", product_title: "Vang A", variant_title: "Vang A" }).title).toBe("Vang A");
    expect(tenHienThi({ sku: "S2" }).title).toBe("S2");
  });
});

describe("stock-alert job", () => {
  it("SQL gộp theo item, lọc deleted_at; du_lieu có title", async () => {
    raw
      .mockResolvedValueOnce({ rows: [{ low_stock_threshold: 3 }] })
      .mockResolvedValueOnce({ rows: [{ sku: "S1", product_title: "Vang A", variant_title: "Default", stocked_quantity: 2, reserved_quantity: 0, available: 2 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await job(container);
    const sql = String(raw.mock.calls[1][0]);
    expect(sql).toContain("GROUP BY ii.id");
    expect(sql).toContain("il.deleted_at IS NULL");
    expect(sql).toContain("ii.deleted_at IS NULL");
    expect(sql).toContain("HAVING");
    expect(raw.mock.calls[1][1]).toEqual([3]);
    const ins = raw.mock.calls[3];
    expect(ins[1][0]).toBe("canh_bao_het_hang");
    const d = JSON.parse(ins[1][2]);
    expect(d).toMatchObject({ threshold: 3, count: 1 });
    expect(d.items[0]).toMatchObject({ sku: "S1", title: "Vang A", available: 2 });
  });

  it("không có SKU thấp: không chèn", async () => {
    raw.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await job(container);
    expect(raw).toHaveBeenCalledTimes(2);
  });
});
