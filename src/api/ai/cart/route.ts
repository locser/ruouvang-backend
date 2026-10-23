import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, remoteQueryObjectFromString } from "@medusajs/framework/utils";
import { checkAuth } from "../../../lib/ai-auth";
import { layCaiDat } from "../../../lib/lay-cai-dat";
import { NHAN_DON_CHATBOT } from "../../../lib/nhan-don";
import {
  createCartWorkflow,
  addToCartWorkflow,
  deleteLineItemsWorkflow,
  updateLineItemInCartWorkflow,
  updateCartWorkflow,
  completeCartWorkflow,
  addShippingMethodToCartWorkflow,
  createPaymentSessionsWorkflow,
  createPaymentCollectionForCartWorkflow
} from "@medusajs/medusa/core-flows";

/**
 * API Quản lý Giỏ hàng & Checkout tự động dành cho AI Chatbot.
 * POST /ai/cart
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized: Invalid x-ai-secret-key header" });
  }

  const { action, cartId, email, sku, quantity, phone, address, province, district, ward, firstName, lastName } = req.body as {
    action: "create" | "add_item" | "update_quantity" | "remove_item" | "clear_cart" | "update_address" | "checkout" | "retrieve";
    cartId?: string;
    email?: string;
    sku?: string;
    quantity?: number;
    phone?: string;
    address?: string;
    province?: string;
    district?: string;
    ward?: string;
    firstName?: string;
    lastName?: string;
  };

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);

  try {
    // 0. RETRIEVE CART
    if (action === "retrieve") {
      if (!cartId) {
        return res.status(400).json({ error: "Missing cartId" });
      }
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
      const { data: carts } = await query.graph({
        entity: "cart",
        // ⚠️ PHẢI có first_name và last_name.
        //
        // Thiếu hai trường này gây vòng lặp vô tận lúc chốt đơn: `update_address`
        // LƯU tên đúng, nhưng `retrieve` không trả về nên `kiemTraDuDieuKienChotDon`
        // đọc `shipping_address.first_name` ra `undefined` → báo THIEU_TEN → bot
        // xin lại tên → khách nhập lại → vẫn thiếu → lặp mãi.
        //
        // Khách nhập tên 3 lần vẫn bị hỏi tiếp (29/07/2026). Dữ liệu nằm trong
        // Medusa suốt, chỉ là câu truy vấn không xin nó.
        //
        // Bài học: mọi trường mà tầng nghiệp vụ ĐỌC đều phải có trong `fields`.
        // query.graph im lặng bỏ qua trường không khai — không lỗi, chỉ undefined.
        fields: [
          "id", "email", "total", "subtotal", "shipping_total", "discount_total",
          "gift_card_total", "tax_total",
          "items.id", "items.variant.sku", "items.title", "items.quantity", "items.unit_price",
          "shipping_address.first_name", "shipping_address.last_name",
          "shipping_address.phone", "shipping_address.address_1",
          "shipping_address.city", "shipping_address.province", "shipping_address.postal_code",
        ],
        filters: { id: cartId }
      });
      if (!carts.length) {
        return res.status(404).json({ error: `Không tìm thấy giỏ hàng ${cartId}` });
      }
      return res.status(200).json({ ok: true, cart: carts[0] });
    }

    // 1. CREATE CART
    if (action === "create") {
      // Email: khách cho thì dùng; không thì lấy email mặc định trong app_settings
      // (`default_customer_email`); vẫn không có thì để TRỐNG (đơn không có email, không gửi mail).
      const cd = await layCaiDat(req.scope);
      const emailDung = email || cd.default_customer_email || undefined;
      const { result: cart } = await createCartWorkflow(req.scope).run({
        input: {
          currency_code: "vnd",
          ...(emailDung ? { email: emailDung } : {}),
        }
      });
      return res.status(200).json({ ok: true, cart_id: cart.id, cart });
    }

    // 2. ADD ITEM TO CART
    if (action === "add_item") {
      if (!cartId || !sku || !quantity) {
        return res.status(400).json({ error: "Missing cartId, sku or quantity" });
      }

      // Find variant by SKU
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
      const { data: variants } = await query.graph({
        entity: "product_variant",
        fields: ["id", "sku"],
        filters: { sku }
      });

      if (!variants.length) {
        return res.status(404).json({ error: `Không tìm thấy variant SKU ${sku}` });
      }

      const variantId = variants[0].id;

      const { result: cart } = await addToCartWorkflow(req.scope).run({
        input: {
          cart_id: cartId,
          items: [{ variant_id: variantId, quantity }]
        }
      });

      return res.status(200).json({ ok: true, cart_id: cartId, cart });
    }

    // 2b. CLEAR CART / 2c. REMOVE ITEM / UPDATE QUANTITY
    //
    // ⚠️ PHẢI sửa giỏ thật trong Medusa.
    //
    // Bản trước chỉ ghi log rồi trả `ok: true` — giỏ Medusa không đổi gì. Khách
    // đổi món/số lượng trong chat, bot báo đã đổi, nhưng lúc chốt đơn Medusa
    // vẫn tính theo giỏ cũ (20/10/2026: đơn CW15 khách chốt 3 chai Riesling
    // 1.575.000đ, nhưng giỏ còn 3 chai Pinot Gris khách đã bỏ → đơn 2.465.000đ).
    if (action === "clear_cart" || action === "remove_item" || action === "update_quantity") {
      if (!cartId) {
        return res.status(400).json({ error: "Missing cartId" });
      }
      if (action !== "clear_cart" && !sku) {
        return res.status(400).json({ error: "Missing cartId or sku" });
      }

      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
      const { data: carts } = await query.graph({
        entity: "cart",
        fields: ["id", "items.id", "items.quantity", "items.variant.sku"],
        filters: { id: cartId },
      });
      if (!carts.length) {
        return res.status(404).json({ error: `Không tìm thấy giỏ hàng ${cartId}` });
      }
      const items: any[] = carts[0].items ?? [];

      if (action === "clear_cart") {
        if (items.length) {
          await deleteLineItemsWorkflow(req.scope).run({
            input: { cart_id: cartId, ids: items.map((i) => i.id) },
          });
        }
        logger.info(`[ClearCart] Cart ${cartId} cleared (${items.length} dòng)`);
        return res.status(200).json({ ok: true, cart_id: cartId, message: "Cart cleared" });
      }

      const item = items.find((i) => i.variant?.sku === sku);
      if (!item) {
        // Không có trong giỏ: với remove là đã đạt mục đích, với update là lỗi.
        if (action === "remove_item") {
          return res.status(200).json({ ok: true, cart_id: cartId, sku, quantity: 0 });
        }
        return res.status(404).json({ error: `SKU ${sku} không có trong giỏ ${cartId}` });
      }

      if (action === "remove_item" || !quantity || quantity <= 0) {
        await deleteLineItemsWorkflow(req.scope).run({
          input: { cart_id: cartId, ids: [item.id] },
        });
        logger.info(`[CartAction] Đã xóa sku ${sku} khỏi cart ${cartId}`);
        return res.status(200).json({ ok: true, cart_id: cartId, sku, quantity: 0 });
      }

      await updateLineItemInCartWorkflow(req.scope).run({
        input: { cart_id: cartId, item_id: item.id, update: { quantity } },
      });
      logger.info(`[CartAction] Đặt sku ${sku} = ${quantity} trong cart ${cartId}`);
      return res.status(200).json({ ok: true, cart_id: cartId, sku, quantity });
    }

    // 3. UPDATE SHIPPING ADDRESS
    if (action === "update_address") {
      if (!cartId) {
        return res.status(400).json({ error: "Missing cartId" });
      }

      // Chỉ đặt email khi khách vừa cho, hoặc giỏ chưa có email mà shop đã cấu hình email mặc định.
      // KHÔNG ghi đè email đã có (bản cũ ghi đè bằng guest@vpholding.com ở mọi lần cập nhật địa chỉ).
      const queryGio = req.scope.resolve(ContainerRegistrationKeys.QUERY);
      const { data: gioHienTai } = await queryGio.graph({
        entity: "cart",
        fields: ["id", "email"],
        filters: { id: cartId },
      });
      const cdDiaChi = await layCaiDat(req.scope);
      const emailDiaChi =
        email || (!gioHienTai?.[0]?.email ? cdDiaChi.default_customer_email : undefined) || undefined;

      const { result: cart } = await updateCartWorkflow(req.scope).run({
        input: {
          id: cartId,
          ...(emailDiaChi ? { email: emailDiaChi } : {}),
          shipping_address: {
            first_name: firstName || "Khách",
            last_name: lastName || "Vãng Lai",
            address_1: address || "Chưa có địa chỉ",
            phone: phone || "0000000000",
            city: province || "",
            province: district || "",
            postal_code: ward || "10000",
            country_code: "vn"
          }
        }
      });

      // Gắn ship ngay khi có địa chỉ để bot báo đủ "tiền hàng + phí ship = tổng" trước khi khách xác nhận.
      // Lỗi ở đây không chặn việc lưu địa chỉ; bước chốt đơn sẽ gắn lại.
      let totals: { item_total: number | null; shipping_total: number | null; total: number | null } | null = null;
      try {
        await attachStandardShipping(req, cartId);
        const queryTong = req.scope.resolve(ContainerRegistrationKeys.QUERY);
        const { data: gioTong } = await queryTong.graph({
          entity: "cart",
          fields: ["id", "item_total", "shipping_total", "total"],
          filters: { id: cartId },
        });
        const g: any = gioTong?.[0];
        if (g) totals = { item_total: Number(g.item_total ?? 0), shipping_total: Number(g.shipping_total ?? 0), total: Number(g.total ?? 0) };
      } catch (e: any) {
        logger.warn(`[update_address] Chưa tính được phí ship tạm cho giỏ ${cartId}: ${e.message}`);
      }

      return res.status(200).json({ ok: true, cart_id: cartId, cart, totals });
    }

    // 4. CHECKOUT
    if (action === "checkout") {
      if (!cartId) {
        return res.status(400).json({ error: "Missing cartId" });
      }

      // a. Add standard shipping method to cart
      //
      // ⚠️ TỰ TRA, KHÔNG GHI CỨNG ID.
      //
      // Bản trước ghi thẳng `id: "so_01KXNMEVW649H2XPH10G4H214P"`. ID đó chỉ tồn
      // tại trong CSDL của shop ĐẦU TIÊN. Mỗi shop là một Medusa + một database
      // riêng nên ID sinh ra khác nhau hoàn toàn — hai shop mới nhận
      // "Shipping Options are invalid for cart" ở MỌI đơn, tức là tắc ngay cuối
      // phễu bán hàng: khách chọn hàng, cho địa chỉ, xác nhận rồi mới hỏng.
      //
      // Thông báo lỗi không hề nhắc tới ID nên rất dễ đi tìm nhầm sang cấu hình
      // vùng giao hàng — vốn hoàn toàn đúng.
      await attachStandardShipping(req, cartId);

      // b. Create payment collection for cart first if it doesn't exist
      let paymentCollectionId: string | undefined;
      try {
        const remoteQuery = req.scope.resolve(ContainerRegistrationKeys.REMOTE_QUERY);
        const [cartCollectionRelation] = await remoteQuery(remoteQueryObjectFromString({
          entryPoint: "cart_payment_collection",
          variables: { filters: { cart_id: cartId } },
          fields: ["payment_collection.id"],
        }));
        paymentCollectionId = cartCollectionRelation?.payment_collection?.id;

        if (!paymentCollectionId) {
          console.log("[CheckoutStep] Running createPaymentCollectionForCartWorkflow...");
          await createPaymentCollectionForCartWorkflow(req.scope).run({
            input: {
              cart_id: cartId
            }
          });
          
          const [updatedRelation] = await remoteQuery(remoteQueryObjectFromString({
            entryPoint: "cart_payment_collection",
            variables: { filters: { cart_id: cartId } },
            fields: ["payment_collection.id"],
          }));
          paymentCollectionId = updatedRelation?.payment_collection?.id;
        }

        console.log("[CheckoutStep] Payment Collection ID retrieved:", paymentCollectionId);
        if (!paymentCollectionId) {
          throw new Error("Could not retrieve payment collection for cart");
        }
      } catch (e: any) {
        console.error("[CheckoutStep] Error in createPaymentCollectionForCartWorkflow:", e);
        throw new Error(`Payment collection error: ${e.message}`);
      }

      // c. Initiate payment session
      try {
        console.log("[CheckoutStep] Running createPaymentSessionsWorkflow...");
        await createPaymentSessionsWorkflow(req.scope).run({
          input: {
            payment_collection_id: paymentCollectionId,
            provider_id: "pp_system_default"
          }
        });
      } catch (e: any) {
        console.error("[CheckoutStep] Error in createPaymentSessionsWorkflow:", e);
        throw new Error(`Payment session error: ${e.message}`);
      }

      // c2. Gắn nhãn cho đơn: kênh chatbot, thanh toán bằng chuyển khoản (chatbot chỉ gửi QR),
      // đang chờ tiền. Metadata của giỏ được chép sang đơn khi hoàn tất.
      try {
        const qGio = req.scope.resolve(ContainerRegistrationKeys.QUERY);
        const { data: gio } = await qGio.graph({ entity: "cart", fields: ["id", "metadata"], filters: { id: cartId } });
        await updateCartWorkflow(req.scope).run({
          input: {
            id: cartId,
            metadata: {
              ...((gio?.[0]?.metadata as Record<string, unknown> | null) ?? {}),
              ...NHAN_DON_CHATBOT,
            },
          },
        });
      } catch (e: any) {
        // Nhãn chỉ để nhân viên dễ nhìn: lỗi ở đây không được chặn việc chốt đơn.
        console.warn("[CheckoutStep] Không gắn được nhãn đơn chatbot:", e?.message ?? e);
      }

      // d. Complete cart -> turns it into an Order
      let result;
      try {
        console.log("[CheckoutStep] Running completeCartWorkflow...");
        result = await completeCartWorkflow(req.scope).run({
          input: {
            id: cartId
          }
        });
      } catch (e: any) {
        console.error("[CheckoutStep] Error in completeCartWorkflow:", e);
        throw new Error(`Complete cart error: ${e.message}`);
      }

      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
      const orderId = result?.result?.id || result?.id;
      if (!orderId) {
        throw new Error("Complete cart workflow did not return a valid order ID");
      }
      
      const { data: orders } = await query.graph({
        entity: "order",
        fields: ["id", "display_id", "total", "subtotal", "item_total", "shipping_total", "tax_total"],
        filters: { id: orderId }
      });

      return res.status(200).json({ ok: true, order: orders[0] });
    }

    return res.status(400).json({ error: `Action ${action} không hợp lệ` });
  } catch (err: any) {
    logger.error(`Error processing cart action ${action}: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Gắn gói vận chuyển tiêu chuẩn vào giỏ (tự tra, không ghi cứng ID — xem ghi chú bên trong).
 * Dùng ở bước nhận địa chỉ (để khách thấy phí ship trước khi xác nhận) và ở bước chốt đơn.
 * Medusa thay phương thức cũ khi thêm lại nên gọi hai lần không cộng phí hai lần.
 */
async function attachStandardShipping(req: MedusaRequest, cartId: string): Promise<void> {
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const { data: dsOption } = await query.graph({
      entity: "shipping_option",
      fields: ["id", "name", "price_type"],
      filters: { deleted_at: null } as any,
    });

    if (!dsOption?.length) {
      throw new Error(
        "Shop chưa cấu hình phương thức vận chuyển nào. " +
        "Chạy: npx medusa exec ./src/scripts/setup-vanchuyen.ts"
      );
    }

    // Ưu tiên gói tiêu chuẩn; không thấy thì lấy cái đầu tiên.
    const chon =
      dsOption.find((o: any) => /tieu chuan|tiêu chuẩn|standard/i.test(o.name ?? "")) ??
      dsOption[0];

    console.log(`[CheckoutStep] Chọn phương thức vận chuyển: ${chon.name} (${chon.id})`);
    await addShippingMethodToCartWorkflow(req.scope).run({
      input: { cart_id: cartId, options: [{ id: chon.id }] },
    });
  } catch (e: any) {
    console.error("[CheckoutStep] Error in addShippingMethodToCartWorkflow:", e);
    throw new Error(`Shipping method error: ${e.message}`);
  }
}
