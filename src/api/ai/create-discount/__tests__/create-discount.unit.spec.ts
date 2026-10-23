const mockRun = jest.fn();
jest.mock("@medusajs/medusa/core-flows", () => ({ createPromotionsWorkflow: () => ({ run: mockRun }) }));
jest.mock("../../../../lib/nhat-ky", () => ({ ghiNhatKy: jest.fn() }));
import { POST } from "../route";

const SECRET = "test-secret-123";
const listPromotions = jest.fn();

function run(body: any, headers: any = { "x-ai-secret-key": SECRET }) {
  const req: any = {
    headers, body,
    scope: { resolve: (k: string) => (k === "promotion" ? { listPromotions } : { error: jest.fn() }) },
  };
  const out: { code: number; body: any } = { code: 0, body: null };
  const res: any = { status(c: number) { out.code = c; return res; }, json(b: unknown) { out.body = b; return res; } };
  return POST(req, res).then(() => out);
}
const input = () => mockRun.mock.calls[0][0].input.promotionsData[0];
const future = () => new Date(Date.now() + 86400000).toISOString();

beforeEach(() => {
  process.env.CONFIG_INTERNAL_SERVICE_KEY = SECRET;
  mockRun.mockReset();
  listPromotions.mockReset();
  listPromotions.mockResolvedValue([]);
  mockRun.mockResolvedValue({ result: [{ id: "promo_1", code: "SALE10" }] });
});

describe("POST /ai/create-discount", () => {
  it("401 unauthorized", async () => {
    expect((await run({ code: "X", percent: 10 }, {})).body.code).toBe("unauthorized");
  });

  it("contract cũ: percent hợp lệ -> promotion, không campaign", async () => {
    const r = await run({ code: "SALE10", percent: 10 });
    expect(r.code).toBe(200);
    expect(r.body).toMatchObject({ ok: true, promotion: { id: "promo_1" } });
    expect(input()).toMatchObject({ code: "SALE10", type: "standard", status: "active" });
    expect(input().application_method).toMatchObject({ type: "percentage", value: 10, currency_code: "vnd" });
    expect(input().campaign).toBeUndefined();
    expect(listPromotions).toHaveBeenCalledWith({ code: ["SALE10"] }, { take: 1 });
  });

  it("amount hợp lệ -> fixed", async () => {
    await run({ code: "AAA", amount: 50000 });
    expect(input().application_method).toMatchObject({ type: "fixed", value: 50000 });
  });

  it.each([
    [{ percent: -1 }], [{ percent: 31 }], [{ percent: 10.5 }], [{ percent: "abc" }],
    [{ amount: 999 }], [{ amount: 500001 }], [{ amount: 1500.5 }], [{}], [{ percent: 0 }],
    [{ percent: 10, currency: "aud" }],
  ])("%j -> 400 invalid_value", async (extra) => {
    const r = await run({ code: "X", ...extra });
    expect(r.code).toBe(400);
    expect(r.body.code).toBe("invalid_value");
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("biên: percent 1 và 30, amount 1000 và 500000 đều qua", async () => {
    for (const x of [{ percent: 1 }, { percent: 30 }, { amount: 1000 }, { amount: 500000 }]) {
      expect((await run({ code: "B" + Object.values(x)[0] + "X", ...x })).code).toBe(200);
    }
  });

  it("thiếu code: 400", async () => {
    expect((await run({ percent: 10 })).body.code).toBe("invalid_value");
  });

  it("ends_at -> campaign có ends_at, identifier duy nhất kèm timestamp; usage_limit -> limit của promotion", async () => {
    const e = future();
    await run({ code: "CAM1", percent: 5, ends_at: e, usage_limit: 20 });
    const c = input().campaign;
    expect(c.campaign_identifier).toMatch(/^AI-CAM1-\d+$/);
    expect(c.ends_at).toEqual(new Date(e));
    expect(c.budget).toBeUndefined();
    expect(input().limit).toBe(20);
  });

  it("chỉ usage_limit: không tạo campaign; chỉ ends_at: không có limit", async () => {
    await run({ code: "CAM2", percent: 5, usage_limit: 3 });
    expect(input().campaign).toBeUndefined();
    expect(input().limit).toBe(3);
    mockRun.mockClear();
    await run({ code: "CAM3", percent: 5, ends_at: future() });
    expect(input().campaign.ends_at).toBeInstanceOf(Date);
    expect(input().limit).toBeUndefined();
  });

  it("code chuẩn hoá chữ hoa + trim; sai định dạng -> 400", async () => {
    await run({ code: "  sale-10_x ", percent: 5 });
    expect(input().code).toBe("SALE-10_X");
    expect(listPromotions).toHaveBeenCalledWith({ code: ["SALE-10_X"] }, { take: 1 });
    for (const c of ["ab", "a".repeat(33), "SALE 10", "GIẢM10", "A$B"]) {
      expect((await run({ code: c, percent: 5 })).body.code).toBe("invalid_value");
    }
  });

  it("percent/amount phải là number: chuỗi hoặc boolean -> 400", async () => {
    for (const x of [{ percent: "10" }, { percent: true }, { amount: "50000" }]) {
      expect((await run({ code: "OKK", ...x })).body.code).toBe("invalid_value");
    }
  });

  it.each([
    [{ ends_at: "khong-phai-ngay" }], [{ ends_at: "2020-01-01T00:00:00Z" }], [{ ends_at: 123 }],
    [{ usage_limit: 0 }], [{ usage_limit: 1.5 }], [{ usage_limit: -2 }], [{ usage_limit: "x" }], [{ usage_limit: true }],
  ])("%j -> 400 invalid_value", async (extra) => {
    const r = await run({ code: "X", percent: 10, ...extra });
    expect(r.code).toBe(400);
    expect(r.body.code).toBe("invalid_value");
  });

  it("mã đã tồn tại (kiểm trước): 409 duplicate_code, không tạo", async () => {
    listPromotions.mockResolvedValue([{ id: "p" }]);
    const r = await run({ code: "SALE10", percent: 10 });
    expect(r.code).toBe(409);
    expect(r.body.code).toBe("duplicate_code");
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("race: workflow báo trùng -> 409 duplicate_code; lỗi khác -> 500 internal_error", async () => {
    mockRun.mockRejectedValueOnce(new Error("Promotion with code SALE10 already exists"));
    expect((await run({ code: "SALE10", percent: 10 })).body.code).toBe("duplicate_code");
    mockRun.mockRejectedValueOnce(new Error("Campaign with campaign_identifier AI-X already exists"));
    expect((await run({ code: "XYZ", percent: 10 })).body.code).toBe("internal_error");
    mockRun.mockRejectedValueOnce(new Error("boom"));
    const r = await run({ code: "ZZZ", percent: 10 });
    expect(r.code).toBe(500);
    expect(r.body.code).toBe("internal_error");
  });
});
