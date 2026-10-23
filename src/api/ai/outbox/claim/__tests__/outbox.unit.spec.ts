import { POST as claim } from "../route";
import { POST as ack, OUTBOX_MAX_ATTEMPTS } from "../../[id]/ack/route";

const SECRET = "test-secret-123";
const raw = jest.fn();
const ID = "11111111-2222-3333-4444-555555555555";

function call(fn: any, body: any, params: any = {}, headers: any = { "x-ai-secret-key": SECRET }) {
  const req: any = { headers, body, params, scope: { resolve: (k: string) => (k === "__pg_connection__" ? { raw } : { error: jest.fn() }) } };
  const out: { code: number; body: any } = { code: 0, body: null };
  const res: any = { status(c: number) { out.code = c; return res; }, json(b: unknown) { out.body = b; return res; } };
  return fn(req, res).then(() => out);
}

beforeEach(() => {
  process.env.CONFIG_INTERNAL_SERVICE_KEY = SECRET;
  raw.mockReset();
});

describe("POST /ai/outbox/claim", () => {
  it("401 khi sai khoá", async () => {
    expect((await call(claim, { types: ["a"] }, {}, {})).code).toBe(401);
  });

  it("SQL nguyên tử: sweep LOI + claim với SKIP LOCKED, so_lan_thu<5, 2 ngày, claimed_at; items theo tao_luc", async () => {
    raw
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "b", tao_luc: "2026-01-02", claimed_at: "t" }, { id: "a", tao_luc: "2026-01-01", claimed_at: "t" }] });
    const r = await call(claim, { types: ["canh_bao_het_hang", "bao_cao_doanh_thu"], limit: 5 });
    expect(r.code).toBe(200);
    expect(r.body.items.map((i: any) => i.id)).toEqual(["a", "b"]);
    const [sweep, sweepP] = raw.mock.calls[0];
    expect(sweep).toContain("trang_thai = 'LOI'");
    expect(sweep).toContain("so_lan_thu >= ?");
    expect(sweepP).toEqual([5]);
    const [sql, params] = raw.mock.calls[1];
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("SET so_lan_thu = so_lan_thu + (CASE WHEN trang_thai = 'DANG_GUI' THEN 1 ELSE 0 END)");
    expect(sql).toContain("interval '10 minutes'");
    expect(sql).toContain("so_lan_thu < ?");
    expect(sql).toContain("tao_luc > now() - interval '2 days'");
    expect(sql).toContain("ORDER BY tao_luc");
    expect(sql).toContain("loai IN (?, ?)");
    expect(sql).toContain("xu_ly_luc::text AS claimed_at");
    expect(params).toEqual([5, "canh_bao_het_hang", "bao_cao_doanh_thu", 5]);
  });

  it("limit mặc định 20, tối đa 50", async () => {
    raw.mockResolvedValue({ rows: [] });
    await call(claim, { types: ["a"] });
    expect(raw.mock.calls[1][1]).toEqual([5, "a", 20]);
    await call(claim, { types: ["a"], limit: 999 });
    expect(raw.mock.calls[3][1]).toEqual([5, "a", 50]);
  });

  it("types bắt buộc: thiếu/sai kiểu -> 400; rỗng -> trả rỗng không chạm DB", async () => {
    expect((await call(claim, {})).body.code).toBe("invalid_body");
    expect((await call(claim, { types: "x" })).body.code).toBe("invalid_body");
    expect((await call(claim, { types: [""] })).code).toBe(400);
    expect((await call(claim, { types: [], limit: 0 })).body).toEqual({ items: [] });
    expect((await call(claim, { types: ["a"], limit: 0 })).code).toBe(400);
    expect(raw).not.toHaveBeenCalled();
  });

  it("DB lỗi: 500 internal_error", async () => {
    raw.mockRejectedValue(new Error("x"));
    const r = await call(claim, { types: ["a"] });
    expect(r.code).toBe(500);
    expect(r.body.code).toBe("internal_error");
  });
});

describe("POST /ai/outbox/:id/ack", () => {
  it("401 / 400 thiếu ok / 404 id không phải uuid", async () => {
    expect((await call(ack, { ok: true }, { id: ID }, {})).code).toBe(401);
    expect((await call(ack, {}, { id: ID })).body.code).toBe("invalid_body");
    expect((await call(ack, { ok: true }, { id: "abc" })).body.code).toBe("not_found");
    expect(raw).not.toHaveBeenCalled();
  });

  it("ok:true -> DA_GUI, chỉ khi đang DANG_GUI", async () => {
    raw.mockResolvedValue({ rows: [{ id: ID, trang_thai: "DA_GUI", so_lan_thu: 0 }] });
    const r = await call(ack, { ok: true }, { id: ID });
    expect(r.code).toBe(200);
    expect(r.body).toMatchObject({ ok: true, trang_thai: "DA_GUI" });
    const [sql, params] = raw.mock.calls[0];
    expect(sql).toContain("'DA_GUI'");
    expect(sql).toContain("trang_thai = 'DANG_GUI'");
    expect(params).toEqual([ID]);
  });

  it("claimed_at: thêm điều kiện khớp xu_ly_luc; không có thì như cũ", async () => {
    raw.mockResolvedValue({ rows: [{ id: ID, trang_thai: "DA_GUI", so_lan_thu: 0 }] });
    await call(ack, { ok: true, claimed_at: "2026-10-23 11:00:00.123456+00" }, { id: ID });
    expect(raw.mock.calls[0][0]).toContain("xu_ly_luc = ?::timestamptz");
    expect(raw.mock.calls[0][1]).toEqual([ID, "2026-10-23 11:00:00.123456+00"]);
    await call(ack, { ok: false, error: "e", claimed_at: "T" }, { id: ID });
    expect(raw.mock.calls[1][0]).toContain("xu_ly_luc = ?::timestamptz");
    expect(raw.mock.calls[1][1]).toEqual([5, "e", ID, "T"]);
    await call(ack, { ok: true }, { id: ID });
    expect(raw.mock.calls[2][0]).not.toContain("timestamptz");
  });

  it("claimed_at lệch (dòng bị giành lại): 409 not_claimed; sai kiểu/định dạng: 400", async () => {
    raw.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ trang_thai: "DANG_GUI" }] });
    const r = await call(ack, { ok: true, claimed_at: "cu" }, { id: ID });
    expect(r.code).toBe(409);
    expect(r.body.code).toBe("not_claimed");
    expect((await call(ack, { ok: true, claimed_at: 5 }, { id: ID })).code).toBe(400);
    raw.mockRejectedValueOnce(Object.assign(new Error("bad"), { code: "22007" }));
    expect((await call(ack, { ok: true, claimed_at: "zzz" }, { id: ID })).code).toBe(400);
  });

  it("ok:false -> tăng so_lan_thu, CHO hoặc LOI theo ngưỡng 5, lưu _loi", async () => {
    raw.mockResolvedValue({ rows: [{ id: ID, trang_thai: "CHO", so_lan_thu: 1 }] });
    const r = await call(ack, { ok: false, error: "telegram 500" }, { id: ID });
    expect(r.body).toMatchObject({ trang_thai: "CHO", so_lan_thu: 1 });
    const [sql, params] = raw.mock.calls[0];
    expect(sql).toContain("so_lan_thu = so_lan_thu + 1");
    expect(sql).toContain("CASE WHEN so_lan_thu + 1 >= ? THEN 'LOI' ELSE 'CHO' END");
    expect(sql).toContain("jsonb_typeof(du_lieu) = 'object'");
    expect(sql).toContain("jsonb_set(du_lieu, '{_loi}'");
    expect(params).toEqual([OUTBOX_MAX_ATTEMPTS, "telegram 500", ID]);
    expect(OUTBOX_MAX_ATTEMPTS).toBe(5);
  });

  it("error dài bị cắt 500 ký tự; thiếu error -> 'unknown'", async () => {
    raw.mockResolvedValue({ rows: [{ id: ID }] });
    await call(ack, { ok: false, error: "x".repeat(900) }, { id: ID });
    expect(raw.mock.calls[0][1][1]).toHaveLength(500);
    await call(ack, { ok: false }, { id: ID });
    expect(raw.mock.calls[1][1][1]).toBe("unknown");
  });

  it("không cập nhật được: dòng tồn tại -> 409 not_claimed; không tồn tại -> 404", async () => {
    raw.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ trang_thai: "CHO" }] });
    const r = await call(ack, { ok: true }, { id: ID });
    expect(r.code).toBe(409);
    expect(r.body.code).toBe("not_claimed");
    raw.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    expect((await call(ack, { ok: true }, { id: ID })).code).toBe(404);
  });

  it("DB lỗi: 500", async () => {
    raw.mockRejectedValue(new Error("x"));
    expect((await call(ack, { ok: true }, { id: ID })).body.code).toBe("internal_error");
  });
});
