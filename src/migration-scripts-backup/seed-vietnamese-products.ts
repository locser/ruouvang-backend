import { MedusaContainer } from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createProductCategoriesWorkflow,
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows";

export default async function seedVietnameseProducts({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  logger.info("Starting to seed Vietnamese specialties...");

  // 1. Get Shipping Profile
  const { data: shippingProfileResult } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  });
  if (!shippingProfileResult.length) {
    throw new Error("No shipping profile found. Please run the initial seed first.");
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

  // 3. Create or get Category "Đặc sản Việt Nam"
  const { data: existingCategories } = await query.graph({
    entity: "product_category",
    fields: ["id", "name"],
    filters: { name: "Đặc sản Việt Nam" },
  });

  let categoryId = "";
  if (existingCategories.length > 0) {
    categoryId = existingCategories[0].id;
    logger.info(`Category 'Đặc sản Việt Nam' already exists with ID: ${categoryId}`);
  } else {
    logger.info("Creating category 'Đặc sản Việt Nam'...");
    const { result: categoryResult } = await createProductCategoriesWorkflow(
      container
    ).run({
      input: {
        product_categories: [
          {
            name: "Đặc sản Việt Nam",
            is_active: true,
          },
        ],
      },
    });
    categoryId = categoryResult[0].id;
    logger.info(`Category 'Đặc sản Việt Nam' created with ID: ${categoryId}`);
  }

  // 4. Create products
  const productsToCreate = [
    {
      title: "Dưa cải muối chua (Pickled Mustard Greens)",
      category_ids: [categoryId],
      description: "Dưa cải muối chua truyền thống Việt Nam, giòn sần sật, chua thanh tự nhiên. Thích hợp ăn kèm thịt kho, lòng xào hoặc nấu canh cá.",
      handle: "dua-cai-muoi-chua",
      weight: 500,
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
          sku: "DUACAI-500G",
          options: {
            "Đóng gói": "Hũ 500g",
          },
          prices: [
            {
              amount: 1.8,
              currency_code: "eur",
            },
            {
              amount: 2.0,
              currency_code: "usd",
            },
          ],
        },
      ],
      sales_channels: [{ id: defaultSalesChannel.id }],
    },
    {
      title: "Cà pháo muối chua ngọt (Pickled White Eggplants)",
      category_ids: [categoryId],
      description: "Cà pháo muối chua ngọt miền Bắc giòn tan, ngấm vị tỏi ớt ấm nồng. Món ăn kèm hoàn hảo cho bữa cơm gia đình đầm ấm.",
      handle: "ca-phao-muoi",
      weight: 400,
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      options: [
        {
          title: "Đóng gói",
          values: ["Hũ 400g"],
        },
      ],
      variants: [
        {
          title: "Hũ 400g",
          sku: "CAPHAO-400G",
          options: {
            "Đóng gói": "Hũ 400g",
          },
          prices: [
            {
              amount: 1.5,
              currency_code: "eur",
            },
            {
              amount: 1.7,
              currency_code: "usd",
            },
          ],
        },
      ],
      sales_channels: [{ id: defaultSalesChannel.id }],
    },
    {
      title: "Nước mắm Phú Quốc cá cơm truyền thống",
      category_ids: [categoryId],
      description: "Nước mắm Phú Quốc truyền thống cốt đặc biệt thơm ngon, ủ chượp tự nhiên từ cá cơm tươi và muối biển trong thùng gỗ bời lời.",
      handle: "nuoc-mam-phu-quoc",
      weight: 600,
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      options: [
        {
          title: "Thể tích",
          values: ["Chai 500ml"],
        },
      ],
      variants: [
        {
          title: "Chai 500ml",
          sku: "NUOCMAM-500ML",
          options: {
            "Thể tích": "Chai 500ml",
          },
          prices: [
            {
              amount: 7.5,
              currency_code: "eur",
            },
            {
              amount: 8.5,
              currency_code: "usd",
            },
          ],
        },
      ],
      sales_channels: [{ id: defaultSalesChannel.id }],
    },
    {
      title: "Muối tôm Tây Ninh loại đặc biệt",
      category_ids: [categoryId],
      description: "Muối tôm Tây Ninh hạt to giòn, thơm nồng mùi tôm khô và ớt cay, thích hợp để chấm các loại trái cây chua như xoài, cóc, ổi.",
      handle: "muoi-tom-tay-ninh",
      weight: 150,
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      options: [
        {
          title: "Đóng gói",
          values: ["Hũ 150g"],
        },
      ],
      variants: [
        {
          title: "Hũ 150g",
          sku: "MUOITOM-150G",
          options: {
            "Đóng gói": "Hũ 150g",
          },
          prices: [
            {
              amount: 2.2,
              currency_code: "eur",
            },
            {
              amount: 2.5,
              currency_code: "usd",
            },
          ],
        },
      ],
      sales_channels: [{ id: defaultSalesChannel.id }],
    },
  ];

  logger.info("Creating Vietnamese specialty products...");
  await createProductsWorkflow(container).run({
    input: {
      products: productsToCreate,
    },
  });

  logger.info("Vietnamese specialties seeded successfully!");
}
