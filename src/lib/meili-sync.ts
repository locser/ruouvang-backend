import { Pool } from "pg";

/**
 * Thư viện dùng chung cho việc đồng bộ sản phẩm Medusa → Meilisearch.
 *
 * Dùng bởi:
 *  - subscribers/meilisearch-product-sync.ts  (đồng bộ thời gian thực)
 *  - jobs/meilisearch-nightly-reconcile.ts    (đối soát đêm)
 *
 * BA VẤN ĐỀ BẢN TRƯỚC MẮC PHẢI, ĐÃ XỬ LÝ Ở ĐÂY:
 *
 * 1. `tenant_id: metadata.tenant_id || "default"` — subscriber ghi chuỗi
 *    "default" trong khi tầng tìm kiếm lọc theo UUID tenant thật, nên mọi
 *    truy vấn trả về RỖNG. Nay lấy từ CONFIG_TENANT_ID và fail-fast nếu thiếu.
 *
 * 2. `price_vnd: firstVariant.price_vnd` — trong Medusa v2 giá KHÔNG nằm trên
 *    variant mà ở Price Set riêng, nên trường này luôn undefined → mọi sản
 *    phẩm có giá 0 → bộ lọc giá vô nghĩa. Nay đọc thẳng từ bảng `price`.
 *
 * 3. `in_stock: metadata.in_stock !== false` — trả true cho MỌI sản phẩm kể cả
 *    hàng đã hết. Nay tính từ `inventory_level` thật.
 */

// ---------------------------------------------------------------------------
// Cấu hình
// ---------------------------------------------------------------------------

export function layCauHinhMeili(): { host: string; key: string; index: string } {
  const host = process.env.CONFIG_MEILI_HOST;
  const key = process.env.CONFIG_MEILI_MASTER_KEY;
  const index = process.env.CONFIG_MEILI_INDEX || "products";
  // Không có giá trị mặc định cho bí mật — thiếu thì dừng, không chạy bằng
  // khoá đoán được. Master key cho toàn quyền ghi/xoá index.
  if (!host) throw new Error("[meili-sync] Thiếu CONFIG_MEILI_HOST");
  if (!key) throw new Error("[meili-sync] Thiếu CONFIG_MEILI_MASTER_KEY");
  return { host, key, index };
}

/**
 * Tenant sở hữu toàn bộ sản phẩm của instance Medusa này.
 *
 * Mô hình đã chốt: MỖI TENANT MỘT MEDUSA RIÊNG (mỗi tenant cấu hình `baseUrl`
 * riêng trong bảng `tenant_platform` của ChatBotAISAAS). Vì vậy tenant_id là
 * hằng số cấp instance, đặt qua biến môi trường.
 *
 * Fail-fast: thiếu biến này thì toàn bộ index sẽ vô chủ và không tìm được gì —
 * thà dừng ngay còn hơn âm thầm ghi "default".
 */
export function layTenantId(): string {
  const v = process.env.CONFIG_TENANT_ID;
  if (!v || v.trim().length === 0) {
    throw new Error(
      "[meili-sync] Thiếu CONFIG_TENANT_ID. Đây là UUID của tenant sở hữu " +
      "instance Medusa này (khớp với tenant.id bên ChatBotAISAAS). " +
      "Không có nó thì mọi document ghi lên Meilisearch sẽ không bao giờ được tìm thấy."
    );
  }
  return v.trim();
}

// ---------------------------------------------------------------------------
// Kết nối PostgreSQL (dùng lại một pool cho cả tiến trình)
// ---------------------------------------------------------------------------

let pool: Pool | null = null;
export function layPool(): Pool {
  if (!pool) {
    const conn = process.env.CONFIG_POSTGRES_URL_MEDUSA;
    if (!conn) throw new Error("[meili-sync] Thiếu CONFIG_POSTGRES_URL_MEDUSA");
    pool = new Pool({ connectionString: conn, max: 4 });
  }
  return pool;
}

// ---------------------------------------------------------------------------
// Document Meilisearch
// ---------------------------------------------------------------------------

export interface TaiLieuSanPham {
  id: string;
  tenant_id: string;
  sku: string;
  title: string;
  handle: string;
  brand: string;
  store_type: string;
  category_path: string[];
  price_vnd: number;
  in_stock: boolean;
  stock_qty: number;
  specs: Record<string, unknown>;
  tags: string[];
  thumbnail: string;
  searchable_text: string;
  popularity: number;
  updated_at: number;
}

/**
 * Truy vấn GIÁ và TỒN KHO THẬT.
 *
 * Đọc thẳng từ `price` (qua price_set) và `inventory_level` thay vì
 * `query.graph` — vì đường dẫn `fields` của query.graph để lấy
 * calculated_price khác nhau giữa các bản minor của Medusa v2 và rất dễ trả
 * về undefined một cách im lặng. SQL thì tường minh và kiểm chứng được.
 *
 * Cùng một câu truy vấn với /ai/products-lookup để chỉ có MỘT định nghĩa duy
 * nhất về "giá của sản phẩm này là bao nhiêu".
 */
const SQL_SAN_PHAM = `
  SELECT
    p.id,
    p.title,
    p.handle,
    p.subtitle,
    p.description,
    p.thumbnail,
    p.status,
    p.metadata,
    p.updated_at,
    COALESCE(
      (SELECT array_agg(pc.handle ORDER BY pc.handle)
         FROM product_category pc
         JOIN product_category_product pcp ON pcp.product_category_id = pc.id
        WHERE pcp.product_id = p.id),
      ARRAY[]::text[]
    ) AS category_path,
    (SELECT pv.sku FROM product_variant pv
      WHERE pv.product_id = p.id AND pv.deleted_at IS NULL
      ORDER BY pv.created_at ASC LIMIT 1) AS sku,
    COALESCE((
      SELECT MIN(pr.amount)::bigint
        FROM product_variant pv
        JOIN product_variant_price_set pvps ON pvps.variant_id = pv.id
        JOIN price pr ON pr.price_set_id = pvps.price_set_id
       WHERE pv.product_id = p.id
         AND pv.deleted_at IS NULL
         AND pr.deleted_at IS NULL
         AND lower(pr.currency_code) = 'vnd'
    ), 0) AS price_vnd,
    COALESCE((
      SELECT SUM(COALESCE(il.stocked_quantity, 0) - COALESCE(il.reserved_quantity, 0))::bigint
        FROM product_variant pv
        JOIN product_variant_inventory_item pvii ON pvii.variant_id = pv.id
        JOIN inventory_level il ON il.inventory_item_id = pvii.inventory_item_id
       WHERE pv.product_id = p.id AND pv.deleted_at IS NULL
    ), 0) AS stock_qty,
    -- Co bien the nao KHONG quan ly ton kho khong?
    --
    -- Trong Medusa, manage_inventory = false nghia la "luon ban duoc, khong
    -- theo doi so luong" — KHONG phai het hang. Nhung san pham nay khong co
    -- ban ghi inventory_level nao nen stock_qty o tren luon ra 0.
    --
    -- Thieu cot nay thi in_stock = false cho toan bo catalog, va moi truy van
    -- cua chatbot (von loc in_stock = true) tra ve 0 ket qua — bot tra loi
    -- "cua hang chua co san pham nao" du CSDL co 7.869 san pham.
    -- Phat hien 04/08/2026 tren shop Hasaki.
    -- (Comment nay khong dau va khong dung backtick: ca khoi SQL nam trong
    --  template literal cua JS, mot dau backtick la dong chuoi som.)
    EXISTS (
      SELECT 1 FROM product_variant pv
       WHERE pv.product_id = p.id
         AND pv.deleted_at IS NULL
         AND pv.manage_inventory = false
    ) AS ban_khong_gioi_han
  FROM product p
  WHERE p.deleted_at IS NULL
`;

function dungTaiLieu(r: any, tenantId: string): TaiLieuSanPham {
  const metadata = (r.metadata || {}) as Record<string, any>;
  const specs = (metadata.specs || {}) as Record<string, unknown>;
  // Tags lấy từ metadata, KHÔNG join bảng product_tag.
  // Lý do: tên bảng nối tag trong Medusa v2 chưa được kiểm chứng trong dự án
  // này (không có chỗ nào đang dùng), đoán sai là câu SQL ném lỗi lúc chạy.
  // Pipeline chuẩn hoá dữ liệu (tài liệu 03) vốn đã ghi tags vào metadata.
  const tags: string[] = Array.isArray(metadata.tags)
    ? (metadata.tags as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const stockQty = Number(r.stock_qty) || 0;

  // Trường gộp giúp câu hỏi tự nhiên ("máy chụp ảnh đẹp pin trâu") khớp được
  // mà không cần vector search.
  const searchable = [
    r.title,
    r.subtitle,
    metadata.brand,
    ...Object.values(specs).map((v) => (typeof v === "object" ? "" : String(v ?? ""))),
    ...tags,
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 1000);

  return {
    id: r.id,
    tenant_id: tenantId,
    sku: r.sku || "",
    title: r.title || "",
    handle: r.handle || "",
    brand: metadata.brand || metadata.nhan_hieu || (specs.thuong_hieu as string) || "",
    // ⚠️ `store_type` NẰM TRONG `metadata.specs`, KHÔNG phải ngay gốc `metadata`.
    //
    // Bản cũ đọc `metadata.store_type` — chỗ mà KHÔNG script seed nào ghi vào
    // (import-shop.ts, seed-real-catalogs.ts, seed-redapron.ts đều ghi
    // `metadata.specs.store_type`). Nên vế trái luôn `undefined` và giá trị
    // mặc định cứng `"farmersmarket"` thắng ở MỌI sản phẩm: kiểm ngày
    // 07/08/2026 thấy **cả 57.993 document của sáu shop đều mang nhãn
    // farmersmarket**. Trường này vô dụng suốt từ đầu mà không ai biết, vì
    // cách ly tenant dựa vào `tenant_id` nên không có triệu chứng nào lộ ra.
    //
    // Bỏ hẳn giá trị mặc định bịa ra. Thiếu thì để rỗng — một ô trống nhìn là
    // biết thiếu, còn một cái tên shop sai thì trông y như dữ liệu đúng.
    store_type: (specs.store_type as string) || metadata.store_type || "",
    category_path: Array.isArray(r.category_path) ? r.category_path.filter(Boolean) : [],
    price_vnd: Number(r.price_vnd) || 0,
    // `manage_inventory = false` ⇒ luôn còn hàng (xem ghi chú ở SQL bên trên).
    in_stock: r.ban_khong_gioi_han === true || stockQty > 0,
    stock_qty: stockQty,
    specs,
    tags,
    thumbnail: r.thumbnail || metadata.thumbnail || "",
    searchable_text: searchable,
    popularity: Number(metadata.popularity) || 0,
    updated_at: r.updated_at ? Math.floor(new Date(r.updated_at).getTime() / 1000) : Math.floor(Date.now() / 1000),
  };
}

/** Đọc một sản phẩm theo id. Trả null nếu không tồn tại hoặc chưa publish. */
export async function docSanPham(productId: string): Promise<TaiLieuSanPham | null> {
  const tenantId = layTenantId();
  const r = await layPool().query(`${SQL_SAN_PHAM} AND p.id = $1`, [productId]);
  if (r.rows.length === 0) return null;
  if (r.rows[0].status !== "published") return null;
  return dungTaiLieu(r.rows[0], tenantId);
}

/** Đọc sản phẩm published theo trang. Dùng cho đối soát toàn bộ. */
export async function docTrangSanPham(limit: number, offset: number): Promise<TaiLieuSanPham[]> {
  const tenantId = layTenantId();
  const r = await layPool().query(
    `${SQL_SAN_PHAM} AND p.status = 'published' ORDER BY p.id ASC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return r.rows.map((row) => dungTaiLieu(row, tenantId));
}

/** Tìm variant theo product_id để phục vụ tra cứu tồn kho khi có sự kiện kho. */
export async function timProductIdTheoInventoryItem(inventoryItemId: string): Promise<string[]> {
  const r = await layPool().query(
    `SELECT DISTINCT pv.product_id
       FROM product_variant_inventory_item pvii
       JOIN product_variant pv ON pv.id = pvii.variant_id
      WHERE pvii.inventory_item_id = $1 AND pv.deleted_at IS NULL`,
    [inventoryItemId]
  );
  return r.rows.map((x: any) => x.product_id).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Gọi Meilisearch
// ---------------------------------------------------------------------------

async function goiMeili(duongDan: string, init: RequestInit): Promise<any> {
  const { host, key } = layCauHinhMeili();
  const ac = new AbortController();
  const hen = setTimeout(() => ac.abort(), 15_000);
  try {
    const res = await fetch(`${host}${duongDan}`, {
      ...init,
      signal: ac.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Meilisearch ${res.status} tại ${duongDan}: ${body.slice(0, 300)}`);
    }
    return await res.json().catch(() => ({}));
  } finally {
    clearTimeout(hen);
  }
}

/**
 * Đẩy document lên index.
 *
 * KHÔNG nuốt lỗi: ném ra ngoài để Redis event bus của Medusa tự retry
 * subscriber. Bản trước chỉ `console.error` rồi đi tiếp — Meilisearch restart
 * một nhịp là mất sự kiện vĩnh viễn, không ai biết.
 */
export async function dayLenMeili(docs: TaiLieuSanPham[]): Promise<void> {
  if (docs.length === 0) return;
  const { index } = layCauHinhMeili();
  await goiMeili(`/indexes/${index}/documents`, { method: "POST", body: JSON.stringify(docs) });
}

export async function xoaKhoiMeili(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { index } = layCauHinhMeili();
  await goiMeili(`/indexes/${index}/documents/delete-batch`, { method: "POST", body: JSON.stringify(ids) });
}

/**
 * Lấy {id, updated_at} của RIÊNG SHOP NÀY trong index — phục vụ đối soát ba chiều.
 *
 * ⚠️ BẮT BUỘC lọc theo `tenant_id`. Ba shop dùng CHUNG một index `products`
 * (ADR-005), cách ly bằng bộ lọc chứ không phải bằng index riêng.
 *
 * Bản trước đọc TOÀN BỘ document không lọc. Job đối soát đêm sau đó so với sản
 * phẩm của riêng shop mình và **xoá tất cả phần còn lại** vì tưởng là document
 * mồ côi. Kết quả: mỗi đêm ba job xoá dữ liệu của nhau.
 *
 * Đêm 29/07/2026 index tụt từ 49.139 xuống 11.520 document — Ẩm Thực Xứ Huế mất
 * sạch 62/62, CellphoneS còn 7.495/45.052. Không có lỗi nào báo ra: job ghi log
 * "Hoàn tất đối soát" vì với góc nhìn của nó thì mọi thứ đúng.
 *
 * Dùng POST /documents/fetch vì GET /documents không nhận tham số `filter`.
 */
export async function docToanBoIdTrongIndex(): Promise<Map<string, number>> {
  const { index } = layCauHinhMeili();
  const tenantId = layTenantId();
  const bang = new Map<string, number>();
  const LO = 1000;
  let offset = 0;
  for (;;) {
    const r = await goiMeili(`/indexes/${index}/documents/fetch`, {
      method: "POST",
      body: JSON.stringify({
        limit: LO,
        offset,
        fields: ["id", "updated_at"],
        filter: `tenant_id = "${tenantId}"`,
      }),
    });
    const ds: Array<{ id: string; updated_at?: number }> = r.results ?? [];
    if (ds.length === 0) break;
    for (const d of ds) bang.set(d.id, Number(d.updated_at) || 0);
    offset += ds.length;
    if (ds.length < LO) break;
  }
  return bang;
}
