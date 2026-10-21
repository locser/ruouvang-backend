/**
 * Test HTTP cho POST /ai/order-status.
 *
 * Handler thật được gắn vào một HTTP server tạm trên cổng ngẫu nhiên, rồi gọi
 * bằng fetch đúng như chatbot gọi. Chỉ có Postgres là giả (jest.mock('pg')),
 * nên không cần Docker hay Medusa đang chạy.
 */

const mockQuery = jest.fn();

jest.mock("pg", () => ({
  Pool: jest.fn().mockImplementation(() => ({ query: (...args: unknown[]) => mockQuery(...args) })),
}));

import http from "http";
import type { AddressInfo } from "net";
import { POST } from "../route";

const SECRET = "test-secret-123";
const SDT = "0912345678";

const DON = {
  id: "order_1",
  display_id: 12,
  status: "pending",
  created_at: new Date("2026-10-01T08:00:00Z"),
  canceled_at: null,
  sdt_nhan: SDT,
  trang_thai_thanh_toan: "captured",
};

const GIAO_DANG_GIAO = [
  {
    packed_at: new Date(),
    shipped_at: new Date(),
    delivered_at: null,
    canceled_at: null,
    ma_van_don: "GHN123",
    link_theo_doi: "https://ghn.test/GHN123",
  },
];

/** Gắn handler thật vào một server HTTP tạm, trả về địa chỉ gốc. */
function khoiDongServer(): Promise<{ url: string; dong: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      let body: unknown = undefined;
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "bad json" }));
        }
      }
      const fakeRes = {
        status(code: number) {
          res.statusCode = code;
          return fakeRes;
        },
        json(obj: unknown) {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(obj));
          return fakeRes;
        },
      };
      const fakeReq = { method: req.method, url: req.url, headers: req.headers, body };
      await POST(fakeReq as any, fakeRes as any);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}/ai/order-status`,
        dong: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

/** Chọn fixture theo câu SQL: truy vấn đơn trả DON, truy vấn giao hàng trả giaoRows. */
function giaLapDb(don: unknown, giaoRows: unknown[] = []) {
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM "order"')) return { rows: don ? [don] : [] };
    return { rows: giaoRows };
  });
}

describe("POST /ai/order-status (HTTP)", () => {
  let server: { url: string; dong: () => Promise<void> };
  const oldSecret = process.env.CONFIG_INTERNAL_SERVICE_KEY;

  beforeAll(async () => {
    process.env.CONFIG_INTERNAL_SERVICE_KEY = SECRET;
    server = await khoiDongServer();
  });

  afterAll(async () => {
    await server.dong();
    process.env.CONFIG_INTERNAL_SERVICE_KEY = oldSecret;
  });

  beforeEach(() => {
    mockQuery.mockReset();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  const goi = (body: unknown, headers: Record<string, string> = { "x-ai-secret-key": SECRET }) =>
    fetch(server.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  it("không có header bí mật thì 401", async () => {
    giaLapDb(DON);
    const r = await goi({ order_code: "CW12", phone: SDT }, {});
    expect(r.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("header bí mật sai thì 401", async () => {
    giaLapDb(DON);
    const r = await goi({ order_code: "CW12", phone: SDT }, { "x-ai-secret-key": "sai" });
    expect(r.status).toBe(401);
  });

  it("thiếu mã đơn hoặc SĐT thì 400", async () => {
    const r1 = await goi({ phone: SDT });
    expect(r1.status).toBe(400);
    const r2 = await goi({ order_code: "CW12" });
    expect(r2.status).toBe(400);
  });

  it("đúng mã và đúng SĐT thì trả trạng thái đơn, không trả thông tin nhạy cảm", async () => {
    giaLapDb(DON, GIAO_DANG_GIAO);
    const r = await goi({ order_code: "CW12", phone: SDT });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toEqual({
      ok: true,
      found: true,
      order: {
        ma_don: "CW12",
        ngay_dat: DON.created_at.toISOString(),
        trang_thai_don: "Đang xử lý",
        trang_thai_thanh_toan: "Đã thanh toán",
        trang_thai_giao_hang: "Đang giao",
        ma_van_don: "GHN123",
        link_theo_doi: "https://ghn.test/GHN123",
      },
    });
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/email|address|first_name|sdt_nhan/i);
  });

  it("chấp nhận mã đơn không có tiền tố CW và SĐT có +84", async () => {
    giaLapDb(DON, GIAO_DANG_GIAO);
    const r = await goi({ order_code: "cw 12", phone: "+84 912 345 678" });
    const body = await r.json();
    expect(body.found).toBe(true);
    expect(body.order.ma_don).toBe("CW12");
  });

  it("SĐT sai thì found=false, cùng kết quả với mã không tồn tại", async () => {
    giaLapDb(DON, GIAO_DANG_GIAO);
    const saiSdt = await (await goi({ order_code: "CW12", phone: "0900000000" })).json();

    giaLapDb(null);
    const saiMa = await (await goi({ order_code: "CW999", phone: SDT })).json();

    expect(saiSdt).toEqual({ ok: true, found: false });
    expect(saiMa).toEqual(saiSdt);
  });

  it("đơn không có SĐT giao hàng thì found=false", async () => {
    giaLapDb({ ...DON, sdt_nhan: null });
    const body = await (await goi({ order_code: "CW12", phone: SDT })).json();
    expect(body).toEqual({ ok: true, found: false });
  });

  it("đơn đã giao thì trạng thái giao hàng là Đã giao", async () => {
    giaLapDb(
      { ...DON, status: "completed" },
      [{ packed_at: new Date(), shipped_at: new Date(), delivered_at: new Date(), ma_van_don: "GHN9", link_theo_doi: null }]
    );
    const { order } = await (await goi({ order_code: "CW12", phone: SDT })).json();
    expect(order.trang_thai_don).toBe("Đã hoàn thành");
    expect(order.trang_thai_giao_hang).toBe("Đã giao");
  });

  it("đơn đã huỷ thì trạng thái là Đã huỷ", async () => {
    giaLapDb({ ...DON, status: "canceled", canceled_at: new Date() }, []);
    const { order } = await (await goi({ order_code: "CW12", phone: SDT })).json();
    expect(order.trang_thai_don).toBe("Đã huỷ");
    expect(order.trang_thai_giao_hang).toBe("Chưa tạo giao hàng");
  });

  it("lỗi cơ sở dữ liệu thì 500 và không lộ chi tiết lỗi", async () => {
    mockQuery.mockRejectedValue(new Error("password authentication failed for user postgres"));
    const r = await goi({ order_code: "CW12", phone: SDT });
    expect(r.status).toBe(500);
    const body = await r.json();
    expect(body).toEqual({ error: "Order lookup failed" });
    expect(JSON.stringify(body)).not.toMatch(/password|postgres/i);
  });
});
