import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { createInventoryLevelsWorkflow, createProductsWorkflow } from "@medusajs/medusa/core-flows";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { checkAuth } from "../../../lib/ai-auth";

/**
 * Thêm sản phẩm mới (them_sua_san_pham - tạo).
 * AN TOÀN: mặc định status = "draft" — sản phẩm do AI tạo KHÔNG tự lên kệ,
 * Admin xem lại rồi mới publish (tránh sai sót ra mặt tiền cửa hàng).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized: Invalid x-ai-secret-key header" });
  }
  const { product, initial_quantity } = req.body as { product: any; initial_quantity?: number };
  if (!product || !product.title) {
    return res.status(400).json({ error: "Thiếu product.title" });
  }

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  try {
    const query: any = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const requestedQuantity = Number(initial_quantity || 0);
    if (!Number.isFinite(requestedQuantity) || !Number.isInteger(requestedQuantity) || requestedQuantity < 0 || requestedQuantity > 100_000) {
      return res.status(400).json({ error: "initial_quantity phải là số nguyên từ 0 đến 100.000." });
    }
    const soLuongDau = requestedQuantity;

    // Telegram gửi payload tối giản. Route tự gắn các quan hệ mặc định mà
    // createProductsWorkflow của Medusa v2 bắt buộc phải có.
    let sanPham = { ...product };
    if (product.sku) {
      const [{ data: profiles }, { data: channels }] = await Promise.all([
        query.graph({ entity: "shipping_profile", fields: ["id", "name"], filters: {}, pagination: { take: 1 } }),
        query.graph({ entity: "sales_channel", fields: ["id", "name"], filters: {}, pagination: { take: 1 } }),
      ]);
      const shippingProfileId = profiles?.[0]?.id;
      if (!shippingProfileId) {
        return res.status(409).json({ error: "Shop chưa có shipping profile; cần hoàn tất cấu hình cửa hàng trước." });
      }
      const gia = Number(product.price_vnd);
      sanPham = {
        title: String(product.title).slice(0, 250),
        description: product.description || undefined,
        shipping_profile_id: shippingProfileId,
        options: [{ title: "Quy cách", values: ["Chai"] }],
        variants: [{
          title: `${String(product.title).slice(0, 220)} — Chai`,
          sku: String(product.sku).slice(0, 100),
          manage_inventory: true,
          allow_backorder: false,
          options: { "Quy cách": "Chai" },
          prices: Number.isFinite(gia) && gia >= 0 ? [{ amount: Math.trunc(gia), currency_code: "vnd" }] : [],
        }],
        sales_channels: channels?.[0]?.id ? [{ id: channels[0].id }] : [],
        metadata: { created_by: "telegram_operator" },
      };
    }

    // status đặt SAU spread để caller không thể lách và publish thẳng.
    const input = { products: [{ ...sanPham, status: "draft" }] };
    const { result } = await createProductsWorkflow(req.scope).run({ input: input as any });
    const created: any = Array.isArray(result) ? result[0] : result;
    let inventoryResult: Record<string, any> = { ok: true, stocked_quantity: 0 };

    if (product.sku && soLuongDau > 0) {
      try {
        const [{ data: variants }, { data: locations }] = await Promise.all([
          query.graph({
            entity: "product_variant",
            fields: ["id", "sku", "inventory_items.inventory_item_id"],
            filters: { sku: product.sku },
            pagination: { take: 1 },
          }),
          query.graph({ entity: "stock_location", fields: ["id", "name"], filters: {}, pagination: { take: 1 } }),
        ]);
        const inventoryItemId = variants?.[0]?.inventory_items?.[0]?.inventory_item_id;
        const locationId = locations?.[0]?.id;
        if (!inventoryItemId || !locationId) throw new Error("Không tìm thấy inventory item hoặc stock location mặc định.");
        const inventory: any = req.scope.resolve(Modules.INVENTORY);
        const levels = await inventory.listInventoryLevels({ inventory_item_id: inventoryItemId, location_id: locationId });
        if (levels?.length) {
          await inventory.updateInventoryLevels([{ inventory_item_id: inventoryItemId, location_id: locationId, stocked_quantity: soLuongDau }]);
        } else {
          await createInventoryLevelsWorkflow(req.scope).run({
            input: { inventory_levels: [{ inventory_item_id: inventoryItemId, location_id: locationId, stocked_quantity: soLuongDau }] },
          });
        }
        inventoryResult = { ok: true, stocked_quantity: soLuongDau, location_id: locationId };
      } catch (inventoryError: any) {
        // Sản phẩm đã được tạo nên không trả 500 (retry sẽ đụng SKU trùng).
        // Trả cảnh báo tường minh để bot không tuyên bố tồn đầu đã ghi thành công.
        inventoryResult = { ok: false, stocked_quantity: 0, warning: inventoryError.message };
        logger.error(`create-product tạo tồn đầu lỗi: ${inventoryError.message}`);
      }
    }
    return res.status(200).json({
      ok: true,
      message: `Đã tạo sản phẩm nháp: ${product.title}. Vào Admin xem lại rồi Publish.`,
      product: created,
      inventory: inventoryResult,
    });
  } catch (err: any) {
    logger.error(`create-product lỗi: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
}
