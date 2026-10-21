import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { checkAuth } from "../../../lib/ai-auth";

/**
 * Cập nhật kho (cap_nhat_kho).
 *  - setQuantity: đặt tồn kho tuyệt đối tại location.
 *  - quantityChange: cộng/trừ tương đối (+/-).
 * Biên độ (max_inventory_change) đã được kiểm ở tầng AI Daemon trước khi gọi route này.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized: Invalid x-ai-secret-key header" });
  }
  const { sku, quantityChange, setQuantity, locationId } = req.body as {
    sku: string;
    quantityChange?: number;
    setQuantity?: number;
    locationId?: string;
  };
  if (!sku) return res.status(400).json({ error: "Thiếu sku" });

  try {
    const inventory: any = req.scope.resolve(Modules.INVENTORY);
    const items = await inventory.listInventoryItems({ sku });
    const item = items?.[0];
    if (!item) return res.status(404).json({ error: `Không tìm thấy inventory item cho SKU: ${sku}` });

    const levels = await inventory.listInventoryLevels({ inventory_item_id: item.id });
    const loc = locationId || levels?.[0]?.location_id;
    if (!loc) {
      return res.status(400).json({ error: "Chưa có location tồn kho cho SKU này (cần tạo inventory level trước)." });
    }

    if (typeof setQuantity === "number") {
      await inventory.updateInventoryLevels([
        { inventory_item_id: item.id, location_id: loc, stocked_quantity: setQuantity },
      ]);
      return res.status(200).json({ ok: true, mode: "set", sku, stocked_quantity: setQuantity });
    }

    const delta = Number(quantityChange || 0);
    if (!delta) return res.status(400).json({ error: "Cần setQuantity hoặc quantityChange khác 0." });
    await inventory.adjustInventory([
      { inventoryItemId: item.id, locationId: loc, adjustment: delta },
    ]);
    return res.status(200).json({ ok: true, mode: "adjust", sku, adjustment: delta });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
