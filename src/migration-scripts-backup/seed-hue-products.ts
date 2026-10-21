import { MedusaContainer } from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createProductCategoriesWorkflow,
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows";

export default async function seedHueProducts({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const pgConnection = container.resolve("__pg_connection__");

  logger.info("🧹 Cleaning up old products for Ẩm Thực Xứ Huế seed...");
  try {
    // Truncate product and dependency tables cascade
    await pgConnection.raw("TRUNCATE TABLE product CASCADE;");
    logger.info("Database cleaned successfully.");
  } catch (err: any) {
    logger.warn(`Clean error: ${err.message}`);
  }

  logger.info("🌱 Seeding Ẩm Thực Xứ Huế products...");

  // 1. Get Shipping Profile
  const { data: shippingProfileResult } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  });
  if (!shippingProfileResult.length) {
    throw new Error("No shipping profile found. Please run initial seed first.");
  }
  const shippingProfile = shippingProfileResult[0];

  // 2. Get Sales Channel
  const { data: salesChannelResult } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
  });
  if (!salesChannelResult.length) {
    throw new Error("No sales channel found.");
  }
  const defaultSalesChannel = salesChannelResult[0];

  // 3. Create Category "Ẩm Thực Xứ Huế"
  logger.info("Creating category 'Ẩm Thực Xứ Huế'...");
  const { result: categoryResult } = await createProductCategoriesWorkflow(
    container
  ).run({
    input: {
      product_categories: [
        {
          name: "Ẩm Thực Xứ Huế",
          is_active: true,
        },
      ],
    },
  });
  const categoryId = categoryResult[0].id;
  logger.info(`Category 'Ẩm Thực Xứ Huế' created with ID: ${categoryId}`);

  // Conversion rate: 1 USD = 25000 VND, 1 EUR = 27000 VND
  const productsToCreate = [
    {
      title: "Bánh Bột Lọc Huế (Gói 10 cái)",
      category_ids: [categoryId],
      description: "Bánh bột lọc Huế nhân tôm thịt truyền thống. Vỏ bánh dai trong suốt, nhân tôm rim đậm đà ngọt thịt kèm nước mắm ruốc ăn kèm chuẩn vị Huế.",
      handle: "banh-bot-loc-hue",
      weight: 300,
      thumbnail: "https://amthucxuhue.com/wp-content/uploads/2025/03/banh-loc-hue-300x300.jpg",
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      options: [
        {
          title: "Đóng gói",
          values: ["Gói 10 cái"],
        },
      ],
      variants: [
        {
          title: "Gói 10 cái",
          sku: "BANHLOC-10PC",
          options: { "Đóng gói": "Gói 10 cái" },
          prices: [
            { amount: 30000 / 27000, currency_code: "eur" },
            { amount: 30000 / 25000, currency_code: "usd" },
          ],
        },
      ],
      sales_channels: [{ id: defaultSalesChannel.id }],
    },
    {
      title: "Bánh Canh Khô Phước Hạnh",
      category_ids: [categoryId],
      description: "Bánh canh khô Phước Hạnh sợi mì dai ngon, phơi nắng tự nhiên, không hàn the hóa chất. Đặc sản ẩm thực Huế mộc mạc đậm đà.",
      handle: "banh-canh-kho-phuoc-hanh",
      weight: 500,
      thumbnail: "https://amthucxuhue.com/wp-content/uploads/2025/03/banh-canh-bot-mi-kho-hue-300x300.jpg",
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      options: [
        {
          title: "Đóng gói",
          values: ["Túi 500g"],
        },
      ],
      variants: [
        {
          title: "Túi 500g",
          sku: "BANHCANHKHO-500G",
          options: { "Đóng gói": "Túi 500g" },
          prices: [
            { amount: 18000 / 27000, currency_code: "eur" },
            { amount: 18000 / 25000, currency_code: "usd" },
          ],
        },
      ],
      sales_channels: [{ id: defaultSalesChannel.id }],
    },
    {
      title: "Bánh Chưng Tiêu Huế",
      category_ids: [categoryId],
      description: "Bánh chưng tiêu Huế thơm cay hạt tiêu đen, nếp dẻo thơm hòa quyện cùng nhân đậu xanh và thịt ba chỉ béo ngậy chuẩn vị cố đô.",
      handle: "banh-chung-tieu-hue",
      weight: 400,
      thumbnail: "https://amthucxuhue.com/wp-content/uploads/2025/03/banh-chung-hue-chinh-goc-300x300.jpg",
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      options: [
        {
          title: "Trọng lượng",
          values: ["Cái 400g"],
        },
      ],
      variants: [
        {
          title: "Cái 400g",
          sku: "BANHCHUNGTIEU",
          options: { "Trọng lượng": "Cái 400g" },
          prices: [
            { amount: 30000 / 27000, currency_code: "eur" },
            { amount: 30000 / 25000, currency_code: "usd" },
          ],
        },
      ],
      sales_channels: [{ id: defaultSalesChannel.id }],
    },
    {
      title: "Bánh Ép Khô Thuận An (Gói 10 cái)",
      category_ids: [categoryId],
      description: "Bánh ép khô Thuận An giòn rụm, ép cùng hành và thịt tôm thơm lừng. Món ăn vặt trứ danh của vùng biển Thuận An Huế.",
      handle: "banh-ep-thuan-an",
      weight: 200,
      thumbnail: "https://amthucxuhue.com/wp-content/uploads/2025/03/banh-ep-kho-thuan-an-hue-300x300.jpg",
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      options: [
        {
          title: "Đóng gói",
          values: ["Gói 10 cái"],
        },
      ],
      variants: [
        {
          title: "Gói 10 cái",
          sku: "BANHEP-10PC",
          options: { "Đóng gói": "Gói 10 cái" },
          prices: [
            { amount: 29000 / 27000, currency_code: "eur" },
            { amount: 29000 / 25000, currency_code: "usd" },
          ],
        },
      ],
      sales_channels: [{ id: defaultSalesChannel.id }],
    },
    {
      title: "Bánh Gói Đậu Xanh Huế (Gói 10 cái)",
      category_ids: [categoryId],
      description: "Bánh gói đậu xanh ngọt bùi, bọc lá chuối hấp chín dẻo thơm. Hương vị bánh dân dã truyền thống của vùng đất kinh kỳ.",
      handle: "banh-goi-dau-xanh-hue",
      weight: 250,
      thumbnail: "https://amthucxuhue.com/wp-content/uploads/2025/03/banh-goi-dau-xanh-hue-300x300.jpg",
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      options: [
        {
          title: "Đóng gói",
          values: ["Gói 10 cái"],
        },
      ],
      variants: [
        {
          title: "Gói 10 cái",
          sku: "BANHGOI-10PC",
          options: { "Đóng gói": "Gói 10 cái" },
          prices: [
            { amount: 25000 / 27000, currency_code: "eur" },
            { amount: 25000 / 25000, currency_code: "usd" },
          ],
        },
      ],
      sales_channels: [{ id: defaultSalesChannel.id }],
    },
    {
      title: "Bánh Hạt Sen Huế Cổ Truyền",
      category_ids: [categoryId],
      description: "Bánh hạt sen Huế sấy giòn, vị ngọt thanh mát, bùi ngậy từ hạt sen hồ Tịnh Tâm nướng thơm. Cực kỳ ngon khi uống kèm trà nóng.",
      handle: "banh-hat-sen-hue",
      weight: 250,
      thumbnail: "https://amthucxuhue.com/wp-content/uploads/2025/03/banh-hat-sen-hue-ngon-re-300x300.jpg",
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      options: [
        {
          title: "Đóng gói",
          values: ["Hộp 250g"],
        },
      ],
      variants: [
        {
          title: "Hộp 250g",
          sku: "BANHHATSEN-250G",
          options: { "Đóng gói": "Hộp 250g" },
          prices: [
            { amount: 49000 / 27000, currency_code: "eur" },
            { amount: 49000 / 25000, currency_code: "usd" },
          ],
        },
      ],
      sales_channels: [{ id: defaultSalesChannel.id }],
    },
    {
      title: "Bánh Ít Tôm Thịt Huế (Đĩa 10 cái)",
      category_ids: [categoryId],
      description: "Bánh ít nhân tôm thịt dẻo quánh từ bột nếp lọc thơm nồng vị tiêu tỏi hành phi đậm chất ẩm thực xứ Huế.",
      handle: "banh-it-tom-thit-hue",
      weight: 350,
      thumbnail: "https://amthucxuhue.com/wp-content/uploads/2025/03/cung-cap-banh-it-tom-thit-hue-300x300.jpg",
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      options: [
        {
          title: "Đóng gói",
          values: ["Gói 10 cái"],
        },
      ],
      variants: [
        {
          title: "Gói 10 cái",
          sku: "BANHIT-10PC",
          options: { "Đóng gói": "Gói 10 cái" },
          prices: [
            { amount: 35000 / 27000, currency_code: "eur" },
            { amount: 35000 / 25000, currency_code: "usd" },
          ],
        },
      ],
      sales_channels: [{ id: defaultSalesChannel.id }],
    },
    {
      title: "Bánh Lọc Chay Huế (Gói 10 cái)",
      category_ids: [categoryId],
      description: "Bánh bột lọc nhân chay làm từ đậu xanh nấm mèo thanh đạm. Vỏ bánh dai trong suốt chuẩn vị ẩm thực chay Huế.",
      handle: "banh-loc-chay-hue",
      weight: 300,
      thumbnail: "https://amthucxuhue.com/wp-content/uploads/2025/03/Banh-loc-chay-hue-300x300.jpg",
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      options: [
        {
          title: "Đóng gói",
          values: ["Gói 10 cái"],
        },
      ],
      variants: [
        {
          title: "Gói 10 cái",
          sku: "BANHLOC-CHAY-10PC",
          options: { "Đóng gói": "Gói 10 cái" },
          prices: [
            { amount: 22000 / 27000, currency_code: "eur" },
            { amount: 22000 / 25000, currency_code: "usd" },
          ],
        },
      ],
      sales_channels: [{ id: defaultSalesChannel.id }],
    },
    {
      title: "Bánh Lọc Trần Huế (Hộp 50 cái)",
      category_ids: [categoryId],
      description: "Bánh lọc trần trần chín sẵn, phi mỡ hành thơm nức cùng nhân tôm rim chấy đỏ ngọt thịt, ăn cùng mắm ngọt chuẩn Huế.",
      handle: "banh-loc-tran-hue",
      weight: 800,
      thumbnail: "https://amthucxuhue.com/wp-content/uploads/2025/03/dia-chi-ban-banh-loc-tran-hue-300x300.jpg",
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      options: [
        {
          title: "Đóng gói",
          values: ["Hộp 50 cái"],
        },
      ],
      variants: [
        {
          title: "Hộp 50 cái",
          sku: "BANHLOC-TRAN-50PC",
          options: { "Đóng gói": "Hộp 50 cái" },
          prices: [
            { amount: 90000 / 27000, currency_code: "eur" },
            { amount: 90000 / 25000, currency_code: "usd" },
          ],
        },
      ],
      sales_channels: [{ id: defaultSalesChannel.id }],
    },
    {
      title: "Bánh Nậm Chay Huế (Gói 10 cái)",
      category_ids: [categoryId],
      description: "Bánh nậm chay bột gạo dẻo mịn bọc nhân đậu xanh nhuyễn hấp chín dẻo thơm. Món ăn nhẹ thanh mát tao nhã.",
      handle: "banh-nam-chay-hue",
      weight: 300,
      thumbnail: "https://amthucxuhue.com/wp-content/uploads/2025/03/banh-nam-chay-hue-ngon-300x300.jpg",
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      options: [
        {
          title: "Đóng gói",
          values: ["Gói 10 cái"],
        },
      ],
      variants: [
        {
          title: "Gói 10 cái",
          sku: "BANHNAM-CHAY-10PC",
          options: { "Đóng gói": "Gói 10 cái" },
          prices: [
            { amount: 25000 / 27000, currency_code: "eur" },
            { amount: 25000 / 25000, currency_code: "usd" },
          ],
        },
      ],
      sales_channels: [{ id: defaultSalesChannel.id }],
    },
    {
      title: "Bánh Phu Thê (Xu Xê) Huế (Hộp 5 cái)",
      category_ids: [categoryId],
      description: "Bánh phu thê (xu xê) Huế dẻo giòn ngậy mùi cơm dừa nạo và ngọt bùi nhân đậu xanh, được gói vuông vức trong hộp lá dừa.",
      handle: "banh-xu-xe-hue",
      weight: 250,
      thumbnail: "https://amthucxuhue.com/wp-content/uploads/2025/03/banh-phu-the-hue-300x300.jpg",
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      options: [
        {
          title: "Đóng gói",
          values: ["Hộp 5 cái"],
        },
      ],
      variants: [
        {
          title: "Hộp 5 cái",
          sku: "BANHXUXE-5PC",
          options: { "Đóng gói": "Hộp 5 cái" },
          prices: [
            { amount: 30000 / 27000, currency_code: "eur" },
            { amount: 30000 / 25000, currency_code: "usd" },
          ],
        },
      ],
      sales_channels: [{ id: defaultSalesChannel.id }],
    },
    {
      title: "Bánh Đậu Xanh Trái Cây Huế (Hộp 10 cái)",
      category_ids: [categoryId],
      description: "Bánh đậu xanh nặn hình trái cây nghệ thuật rực rỡ, bọc lớp thạch rau câu bóng bẩy. Món bánh ngự tiến cung đình Huế xưa.",
      handle: "banh-dau-xanh-trai-cay-hue",
      weight: 200,
      thumbnail: "https://amthucxuhue.com/wp-content/uploads/2025/03/cung-cap-banh-dau-xanh-trai-cay-hue-300x300.jpg",
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      options: [
        {
          title: "Đóng gói",
          values: ["Hộp 10 cái"],
        },
      ],
      variants: [
        {
          title: "Hộp 10 cái",
          sku: "BANHDAUXANH-TRAICAY",
          options: { "Đóng gói": "Hộp 10 cái" },
          prices: [
            { amount: 35000 / 27000, currency_code: "eur" },
            { amount: 35000 / 25000, currency_code: "usd" },
          ],
        },
      ],
      sales_channels: [{ id: defaultSalesChannel.id }],
    },
    {
      title: "Dưa Cà Mắm Nêm Huế",
      category_ids: [categoryId],
      description: "Cà pháo muối giòn rụm kết hợp mắm nêm cá cơm chua cay thơm nồng tỏi ớt gừng tươi và dứa băm nhuyễn, đậm chất Huế.",
      handle: "dua-ca-mam-nem",
      weight: 500,
      thumbnail: "https://amthucxuhue.com/wp-content/uploads/2025/07/dua-ca-mam-nem-300x300.jpg",
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      options: [
        {
          title: "Đóng gói",
          values: ["Hũ 500g"],
        },
      ],
      variants: [
        {
          title: "Hũ 500g",
          sku: "DUACAMAMNEM-500G",
          options: { "Đóng gói": "Hũ 500g" },
          prices: [
            { amount: 45000 / 27000, currency_code: "eur" },
            { amount: 45000 / 25000, currency_code: "usd" },
          ],
        },
      ],
      sales_channels: [{ id: defaultSalesChannel.id }],
    }
  ];

  logger.info("Executing createProductsWorkflow...");
  await createProductsWorkflow(container).run({
    input: {
      products: productsToCreate,
    },
  });

  logger.info("🎉 Seeding Ẩm Thực Xứ Huế specialties successfully completed!");
}
