import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import * as crypto from "crypto";
import { checkAuth } from "../../../lib/ai-auth";

function sha256(str: string): string {
  return crypto.createHash("sha256").update(str).digest("hex");
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized: Invalid x-ai-secret-key header" });
  }

  const { sku, quantity, orderId, carrier, lineItemId } = req.body as {
    sku: string;
    quantity: number;
    orderId: string;
    carrier: string;
    lineItemId?: string;
  };

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  
  if (!sku || !quantity || !orderId || !carrier) {
    return res.status(400).json({ error: "Missing required parameters: sku, quantity, orderId, carrier" });
  }

  // Cửa chặn cuối (safety threshold check)
  if (quantity > 100) {
    return res.status(400).json({ error: "Vượt hạn mức số lượng chốt đơn tự động (> 100) — cần người duyệt" });
  }

  // 1. Generate unique idempotency key based on intent fingerprint (as specified in SAFETY_SWITCH.md §4)
  const lineItemUnique = lineItemId || "default-item";
  const idempotencyKey = sha256(`chot_don|${orderId}|${lineItemUnique}|${sku}|${quantity}|${carrier}`);

  const pgConnection = req.scope.resolve("__pg_connection__");

  try {
    // 2. Try to acquire lock / check action log (using Postgres UNIQUE index as transaction referee)
    const existingLog = await pgConnection.raw(
      "SELECT trang_thai, ket_qua FROM ai_action_log WHERE idempotency_key = ?",
      [idempotencyKey]
    );

    if (existingLog.rows.length > 0) {
      const log = existingLog.rows[0];
      if (log.trang_thai === "XONG") {
        logger.info(`Idempotent block: Action already completed for key ${idempotencyKey}`);
        return res.status(200).json({
          ok: true,
          fulfillment: log.ket_qua,
          ghi_chu: "Đã chạy thành công trước đó (idempotency key matched)"
        });
      }
      if (log.trang_thai === "DANG_CHAY") {
        logger.warn(`Idempotent block: Action is currently running for key ${idempotencyKey}`);
        return res.status(409).json({
          error: "Hành động này đang chạy song song — thử lại sau"
        });
      }
      // If status is 'LOI' (Error), we will retry. So we delete the old failed log first.
      await pgConnection.raw("DELETE FROM ai_action_log WHERE idempotency_key = ?", [idempotencyKey]);
    }

    // 3. Register running status in database
    await pgConnection.raw(
      "INSERT INTO ai_action_log (idempotency_key, hanh_dong, tham_so, trang_thai) VALUES (?, ?, ?, ?)",
      [idempotencyKey, "chot_don", JSON.stringify({ sku, quantity, orderId, carrier, lineItemId }), "DANG_CHAY"]
    );

    logger.info(`Starting fulfillment process for order ${orderId}, SKU: ${sku}`);

    // 4. Simulate shipping carrier call (outsourced system integration)
    const trackingNumber = `VN-SHIP-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const outsourcedFulfillmentResult = {
      orderId,
      trackingNumber,
      carrier,
      sku,
      quantity,
      estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      status: "SHIPPED_OUTSOURCED"
    };

    // 5. Deduct inventory in Medusa core
    try {
      const inventoryModule = req.scope.resolve(Modules.INVENTORY);
      if (inventoryModule) {
        const [inventoryItem] = await inventoryModule.listInventoryItems({ sku });
        if (inventoryItem) {
          logger.info(`Deducting ${quantity} units from inventory item: ${inventoryItem.id}`);
          const levels = await inventoryModule.listInventoryLevels({ inventory_item_id: inventoryItem.id });
          if (levels.length > 0) {
            await inventoryModule.adjustInventory(
              inventoryItem.id,
              levels[0].location_id,
              -quantity
            );
            logger.info("Inventory successfully adjusted.");
          }
        }
      }
    } catch (invErr: any) {
      logger.warn(`Could not adjust inventory: ${invErr.message}`);
    }

    // 6. Mark action as completed and update DB log
    await pgConnection.raw(
      "UPDATE ai_action_log SET trang_thai = 'XONG', ket_qua = ?, xong_luc = NOW() WHERE idempotency_key = ?",
      [JSON.stringify(outsourcedFulfillmentResult), idempotencyKey]
    );

    res.status(200).json({
      ok: true,
      fulfillment: outsourcedFulfillmentResult
    });
  } catch (err: any) {
    logger.error(`Error processing chot-don: ${err.message}`);
    try {
      await pgConnection.raw(
        "UPDATE ai_action_log SET trang_thai = 'LOI', ket_qua = ?, xong_luc = NOW() WHERE idempotency_key = ?",
        [JSON.stringify({ error: err.message }), idempotencyKey]
      );
    } catch (dbErr) {
      // ignore db update failures during exception handling
    }
    res.status(500).json({ error: err.message });
  }
}
