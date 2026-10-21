-- ============================================================================
--  NẠP TỒN KHO CHO CÁC BIẾN THỂ CHƯA CÓ — dữ liệu NGẪU NHIÊN để kiểm thử
--
--  Chạy trên CSDL Medusa của TỪNG shop:
--    docker exec -e PGPASSWORD=... medusa-postgres \
--      psql -U postgres -d medusa_cellphones -v ON_ERROR_STOP=1 -f /tmp/nap-ton-kho.sql
--
--  ═══ VÌ SAO CẦN FILE NÀY ═══
--
--  `import-shop.ts` tạo biến thể với `manage_inventory: false` và chỉ cất số
--  tồn kho nguồn vào `metadata.ton_kho_nguon`. Nhưng `lib/meili-sync.ts` tính
--  tồn kho bằng câu SQL join qua `inventory_level` — bảng đó RỖNG, nên mọi sản
--  phẩm vào Meilisearch với `in_stock = false`.
--
--  Hậu quả: tool `search_products` mặc định lọc `in_stock = true` → trả về 0
--  kết quả cho MỌI truy vấn. Bot không bán được gì, dù CSDL có 45.052 sản phẩm.
--  Phát hiện 29/07/2026 khi hỏi bot "shop có iphone không" và nó trả lời không có.
--
--  ═══ SỐ LƯỢNG NGẪU NHIÊN ═══
--
--  Theo yêu cầu: nạp số ngẫu nhiên 20–500 để mọi sản phẩm đều còn hàng, kiểm
--  thử cho dễ. KHÔNG dùng số tồn kho thật từ nguồn vì phần lớn bằng 0
--  (chỉ 9.423/45.052 sản phẩm CellphoneS có hàng).
--
--  ⚠️ Đây là dữ liệu KIỂM THỬ. Trước khi bán thật phải thay bằng tồn kho thật
--     từ hệ thống kho của shop.
--
--  Idempotent: chỉ tạo cho biến thể CHƯA có liên kết tồn kho.
-- ============================================================================

BEGIN;

\set ON_ERROR_STOP on

-- Kho của shop này. Mỗi shop chỉ có một kho ("Kho chính" do import-shop.ts tạo).
CREATE TEMP TABLE _kho AS
SELECT id FROM stock_location WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _kho) THEN
    RAISE EXCEPTION 'Không tìm thấy stock_location nào. Chạy import-shop.ts trước.';
  END IF;
END $$;

-- Biến thể cần nạp: còn sống và CHƯA có liên kết tồn kho nào.
CREATE TEMP TABLE _can_nap AS
SELECT pv.id AS variant_id,
       pv.sku,
       'iitem_' || replace(gen_random_uuid()::text, '-', '') AS inv_item_id,
       -- 20–500, phân bố đều. Đủ lớn để test thêm giỏ nhiều lần mà không hết.
       (20 + floor(random() * 481))::int AS so_luong
FROM product_variant pv
WHERE pv.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM product_variant_inventory_item l
    WHERE l.variant_id = pv.id AND l.deleted_at IS NULL
  );

-- 1. inventory_item — một cái cho mỗi biến thể
INSERT INTO inventory_item (id, sku, title, requires_shipping, created_at, updated_at)
SELECT inv_item_id, sku, sku, true, now(), now() FROM _can_nap;

-- 2. Liên kết biến thể ↔ inventory_item
INSERT INTO product_variant_inventory_item
       (id, variant_id, inventory_item_id, required_quantity, created_at, updated_at)
SELECT 'pvitem_' || replace(gen_random_uuid()::text, '-', ''),
       variant_id, inv_item_id, 1, now(), now()
FROM _can_nap;

-- 3. inventory_level — số lượng thật nằm ở đây
--
--    Medusa v2 lưu số bằng kiểu BigNumber: cột `stocked_quantity` (numeric) để
--    truy vấn SQL, và `raw_stocked_quantity` (jsonb) là bản gốc mà tầng ứng dụng
--    đọc. GHI THIẾU cột raw_* thì API trả về 0 dù SQL thấy số đúng.
INSERT INTO inventory_level
       (id, inventory_item_id, location_id,
        stocked_quantity, reserved_quantity, incoming_quantity,
        raw_stocked_quantity, raw_reserved_quantity, raw_incoming_quantity,
        created_at, updated_at)
SELECT 'ilev_' || replace(gen_random_uuid()::text, '-', ''),
       n.inv_item_id, k.id,
       n.so_luong, 0, 0,
       jsonb_build_object('value', n.so_luong::text, 'precision', 20),
       jsonb_build_object('value', '0', 'precision', 20),
       jsonb_build_object('value', '0', 'precision', 20),
       now(), now()
FROM _can_nap n CROSS JOIN _kho k;

-- 4. Bật theo dõi tồn kho cho các biến thể vừa nạp
--
--    `manage_inventory = false` nghĩa là Medusa KHÔNG trừ kho khi bán. Để nguyên
--    thì có inventory_level cũng vô nghĩa: bán bao nhiêu cũng không bao giờ hết.
UPDATE product_variant pv
SET manage_inventory = true, updated_at = now()
FROM _can_nap n WHERE pv.id = n.variant_id;

COMMIT;

-- ============================================================================
-- KIỂM CHỨNG
-- ============================================================================
SELECT 'biến thể'            AS hang_muc, count(*) FROM product_variant WHERE deleted_at IS NULL
UNION ALL SELECT 'inventory_item',  count(*) FROM inventory_item  WHERE deleted_at IS NULL
UNION ALL SELECT 'inventory_level', count(*) FROM inventory_level WHERE deleted_at IS NULL
UNION ALL SELECT 'liên kết',        count(*) FROM product_variant_inventory_item WHERE deleted_at IS NULL
UNION ALL SELECT 'theo dõi kho',    count(*) FROM product_variant WHERE manage_inventory = true AND deleted_at IS NULL
UNION ALL SELECT 'còn hàng (>0)',   count(*) FROM inventory_level WHERE stocked_quantity > 0 AND deleted_at IS NULL;
