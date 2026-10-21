import { MedusaContainer } from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createProductCategoriesWorkflow,
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows";

export default async function seed30VietnameseProducts({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  logger.info("Starting to seed 30 Vietnamese specialties...");

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

  // Base URL for local storefront images
  const baseUrl = "http://localhost:8000/images";

  const rawProducts = [
    // --- Group 1: Dưa cải / Pickled Greens ---
    {
      title: "Dưa cải chua miền Tây Nam Bộ",
      description: "Dưa cải chua ngọt đậm đà chuẩn vị miền Tây, giòn sần sật xào lòng xào thịt đều ngon.",
      handle: "dua-cai-chua-mien-tay",
      weight: 500,
      image: `${baseUrl}/pickled_greens.png`,
      priceEur: 2.0,
      priceUsd: 2.2,
      optionName: "Đóng gói",
      variantName: "Hũ 500g",
      sku: "DC-MIENTAY-500G"
    },
    {
      title: "Dưa cải muối chua ngọt giòn",
      description: "Dưa cải bẹ chọn lọc muối chua ngọt cay nhẹ, dùng ăn kèm cơm trắng thịt luộc cực kỳ đưa miệng.",
      handle: "dua-cai-chua-ngot-gion",
      weight: 500,
      image: `${baseUrl}/pickled_greens.png`,
      priceEur: 1.9,
      priceUsd: 2.1,
      optionName: "Đóng gói",
      variantName: "Hũ 500g",
      sku: "DC-CHUANGOT-500G"
    },
    {
      title: "Củ kiệu muối chua ngọt truyền thống",
      description: "Củ kiệu muối giòn ngọt, vị chua thanh nhẹ nhàng, món ăn không thể thiếu trong ngày Tết cổ truyền.",
      handle: "cu-kieu-muoi-chua-ngot",
      weight: 350,
      image: `${baseUrl}/pickled_greens.png`,
      priceEur: 3.5,
      priceUsd: 3.9,
      optionName: "Đóng gói",
      variantName: "Hũ 350g",
      sku: "CK-TRUYENTHONG-350G"
    },
    {
      title: "Dưa kiệu chua ngọt miền Tây",
      description: "Củ kiệu chua ngọt ngâm tỏi ớt đậm vị, giòn ngon hết sẩy ăn kèm bánh chưng bánh tét.",
      handle: "dua-kieu-chua-ngot-mien-tay",
      weight: 350,
      image: `${baseUrl}/pickled_greens.png`,
      priceEur: 3.2,
      priceUsd: 3.6,
      optionName: "Đóng gói",
      variantName: "Hũ 350g",
      sku: "DK-MIENTAY-350G"
    },
    {
      title: "Măng chua ngâm tỏi ớt Tây Bắc",
      description: "Măng tre non thái lát ngâm tỏi ớt đặc sản vùng núi Tây Bắc, thơm nồng chua cay kích thích vị giác.",
      handle: "mang-chua-toi-ot-tay-bac",
      weight: 800,
      image: `${baseUrl}/pickled_greens.png`,
      priceEur: 4.0,
      priceUsd: 4.5,
      optionName: "Đóng gói",
      variantName: "Hũ 800g",
      sku: "MC-TAYBAC-800G"
    },
    {
      title: "Nhút Thanh Chương xứ Nghệ",
      description: "Đặc sản nhút làm từ xơ mít mật và muối biển trắng tinh, xào thịt bò xào lòng bò ngon đúng điệu Nghệ An.",
      handle: "nhut-thanh-chuong-xu-nghe",
      weight: 500,
      image: `${baseUrl}/pickled_greens.png`,
      priceEur: 3.0,
      priceUsd: 3.4,
      optionName: "Đóng gói",
      variantName: "Hũ 500g",
      sku: "N-THANHCHUONG-500G"
    },
    {
      title: "Dưa chuột bao tử muối chua ngọt",
      description: "Dưa chuột bao tử giòn ruộm ngâm chua ngọt tinh tế cùng tỏi và thì là thơm mát.",
      handle: "dua-chuot-bao-tu-muoi",
      weight: 450,
      image: `${baseUrl}/pickled_greens.png`,
      priceEur: 2.5,
      priceUsd: 2.8,
      optionName: "Đóng gói",
      variantName: "Hũ 450g",
      sku: "DCBT-450G"
    },
    {
      title: "Đu đủ muối chua cay giòn tan",
      description: "Đu đủ xanh bào sợi ngâm chua ngọt cay nồng, ăn kèm đồ nướng hay bánh mì giò chả cực ngon.",
      handle: "du-du-muoi-chua-cay",
      weight: 400,
      image: `${baseUrl}/pickled_greens.png`,
      priceEur: 1.8,
      priceUsd: 2.0,
      optionName: "Đóng gói",
      variantName: "Hũ 400g",
      sku: "DDM-400G"
    },
    {
      title: "Kim chi Việt Nam vị chua ngọt",
      description: "Sự kết hợp hoàn hảo giữa kim chi Hàn Quốc và hương vị tỏi ớt đặc trưng của Việt Nam.",
      handle: "kim-chi-viet-nam",
      weight: 500,
      image: `${baseUrl}/pickled_greens.png`,
      priceEur: 2.2,
      priceUsd: 2.5,
      optionName: "Đóng gói",
      variantName: "Hũ 500g",
      sku: "KCVN-500G"
    },

    // --- Group 2: Cà pháo / Pickled Eggplants ---
    {
      title: "Cà pháo muối tỏi ớt chua ngọt",
      description: "Cà pháo giòn tan ngâm mắm đường tỏi ớt, vị chua ngọt cay mặn hài hòa đưa cơm cực đỉnh.",
      handle: "ca-phao-toi-ot-chua-ngot",
      weight: 400,
      image: `${baseUrl}/pickled_eggplant.png`,
      priceEur: 1.6,
      priceUsd: 1.8,
      optionName: "Đóng gói",
      variantName: "Hũ 400g",
      sku: "CPTO-400G"
    },
    {
      title: "Cà pháo muối nêm truyền thống",
      description: "Cà pháo muối bằng mắm nêm nguyên chất đậm vị miền Trung, mặn mòi giòn giã.",
      handle: "ca-phao-muoi-nem-mientrung",
      weight: 400,
      image: `${baseUrl}/pickled_eggplant.png`,
      priceEur: 1.7,
      priceUsd: 1.9,
      optionName: "Đóng gói",
      variantName: "Hũ 400g",
      sku: "CPMN-400G"
    },
    {
      title: "Cà pháo muối chua cay giòn rụm",
      description: "Cà pháo trắng muối chua cay giòn sần sật, ăn kèm bát canh cua rau đay đúng vị quê nhà.",
      handle: "ca-phao-muoi-chua-cay",
      weight: 450,
      image: `${baseUrl}/pickled_eggplant.png`,
      priceEur: 1.5,
      priceUsd: 1.7,
      optionName: "Đóng gói",
      variantName: "Hũ 450g",
      sku: "CPMC-450G"
    },
    {
      title: "Cà pháo muối sả ớt đặc sản",
      description: "Cà pháo tươi ngâm sả ớt băm nhỏ, cay nồng ấm bụng, thích hợp cho ngày đông lạnh giá.",
      handle: "ca-phao-muoi-sa-ot",
      weight: 400,
      image: `${baseUrl}/pickled_eggplant.png`,
      priceEur: 1.6,
      priceUsd: 1.8,
      optionName: "Đóng gói",
      variantName: "Hũ 400g",
      sku: "CPSO-400G"
    },
    {
      title: "Sung muối sả ớt giòn cay nồng",
      description: "Quả sung nếp muối giòn tan ngấm sả ớt, vị chát nhẹ chua ngọt thích hợp chấm ốc luộc.",
      handle: "sung-muoi-sa-ot-gion",
      weight: 350,
      image: `${baseUrl}/pickled_eggplant.png`,
      priceEur: 1.8,
      priceUsd: 2.0,
      optionName: "Đóng gói",
      variantName: "Hũ 350g",
      sku: "SM-350G"
    },

    // --- Group 3: Nước mắm / Mắm ---
    {
      title: "Nước mắm Phú Quốc 40 độ đạm",
      description: "Nước mắm Phú Quốc hảo hạng cốt nhĩ đặc biệt, vị ngọt hậu sâu tinh tế từ cá cơm tươi.",
      handle: "nuoc-mam-phu-quoc-40-dam",
      weight: 600,
      image: `${baseUrl}/fish_sauce.png`,
      priceEur: 8.0,
      priceUsd: 9.0,
      optionName: "Thể tích",
      variantName: "Chai 500ml",
      sku: "NM-PQ40-500ML"
    },
    {
      title: "Nước mắm Phú Quốc 35 độ đạm",
      description: "Nước mắm cốt cá cơm 35 độ đạm dùng ăn sống hoặc nêm nếm hàng ngày rất ngon và đậm vị.",
      handle: "nuoc-mam-phu-quoc-35-dam",
      weight: 600,
      image: `${baseUrl}/fish_sauce.png`,
      priceEur: 6.5,
      priceUsd: 7.2,
      optionName: "Thể tích",
      variantName: "Chai 500ml",
      sku: "NM-PQ35-500ML"
    },
    {
      title: "Nước mắm Nha Trang hảo hạng",
      description: "Nước mắm Nha Trang làm từ cá cơm trích nổi tiếng miền Trung, hương thơm đặc trưng, vị đậm mặn mòi.",
      handle: "nuoc-mam-nha-trang-hao-hang",
      weight: 600,
      image: `${baseUrl}/fish_sauce.png`,
      priceEur: 5.5,
      priceUsd: 6.0,
      optionName: "Thể tích",
      variantName: "Chai 500ml",
      sku: "NM-NT-500ML"
    },
    {
      title: "Nước mắm Phan Thiết truyền thống",
      description: "Nước mắm Phan Thiết truyền thống làm từ cá nục than hảo hạng, ủ chượp từ các nhà lều mắm cổ xưa.",
      handle: "nuoc-mam-phan-thiet-truyen-thong",
      weight: 600,
      image: `${baseUrl}/fish_sauce.png`,
      priceEur: 5.8,
      priceUsd: 6.5,
      optionName: "Thể tích",
      variantName: "Chai 500ml",
      sku: "NM-PT-500ML"
    },
    {
      title: "Mắm tôm Ba Làng Thanh Hóa cốt lọc",
      description: "Mắm tôm Ba Làng mịn, thơm nồng đặc trưng, chưng cất tự nhiên từ con moi biển tươi và muối trắng.",
      handle: "mam-tom-ba-lang-thanh-hoa",
      weight: 300,
      image: `${baseUrl}/fish_sauce.png`,
      priceEur: 2.8,
      priceUsd: 3.2,
      optionName: "Đóng gói",
      variantName: "Hũ 300g",
      sku: "MTBL-300G"
    },
    {
      title: "Mắm tép chưng thịt Hàng Bè",
      description: "Mắm tép chưng sẵn thơm ngậy đậm đà hương tỏi sả, trộn cơm nóng ăn mùa lạnh cực kỳ tốn cơm.",
      handle: "mam-tep-chung-thit-hang-be",
      weight: 250,
      image: `${baseUrl}/fish_sauce.png`,
      priceEur: 4.5,
      priceUsd: 5.0,
      optionName: "Đóng gói",
      variantName: "Hũ 250g",
      sku: "MTCT-250G"
    },
    {
      title: "Mắm nêm Dì Cẩn Đà Nẵng chính hiệu",
      description: "Mắm nêm Dì Cẩn nổi tiếng thơm ngon đậm vị, ăn kèm thịt luộc bánh tráng cuốn rau rừng.",
      handle: "mam-nem-di-can-da-nang",
      weight: 500,
      image: `${baseUrl}/fish_sauce.png`,
      priceEur: 3.8,
      priceUsd: 4.2,
      optionName: "Thể tích",
      variantName: "Chai 500ml",
      sku: "MNDC-500ML"
    },
    {
      title: "Mắm ruốc Huế Bà Duệ đặc sản",
      description: "Mắm ruốc Huế Bà Duệ dùng để xào thịt sả ớt hoặc nấu bún bò Huế thơm lừng đúng điệu cố đô.",
      handle: "mam-ruoc-hue-ba-due",
      weight: 400,
      image: `${baseUrl}/fish_sauce.png`,
      priceEur: 3.2,
      priceUsd: 3.6,
      optionName: "Đóng gói",
      variantName: "Hũ 400g",
      sku: "MRBD-400G"
    },

    // --- Group 4: Muối / Salts ---
    {
      title: "Muối tôm Tây Ninh loại đặc sản loại 1",
      description: "Muối tôm Tây Ninh loại tốt nhất, thơm đậm mùi tôm khô chấm xoài chấm cóc ngon khó cưỡng.",
      handle: "muoi-tom-tay-ninh-loai-1",
      weight: 150,
      image: `${baseUrl}/shrimp_salt.png`,
      priceEur: 2.2,
      priceUsd: 2.5,
      optionName: "Đóng gói",
      variantName: "Hũ 150g",
      sku: "MVT-TN1-150G"
    },
    {
      title: "Muối tôm Tây Ninh siêu cay cực hạn",
      description: "Muối tôm hạt to siêu cay nồng cho những tín đồ nghiện ăn cay, kích thích vị giác tối đa.",
      handle: "muoi-tom-tay-ninh-sieu-cay",
      weight: 150,
      image: `${baseUrl}/shrimp_salt.png`,
      priceEur: 2.3,
      priceUsd: 2.6,
      optionName: "Đóng gói",
      variantName: "Hũ 150g",
      sku: "MVT-TNSC-150G"
    },
    {
      title: "Muối ớt Tây Ninh đặc sản thơm nồng",
      description: "Muối ớt không tôm chay mặn đều dùng được, thơm ngon cay nồng đặc trưng Tây Ninh.",
      handle: "muoi-ot-tay-ninh-dac-san",
      weight: 150,
      image: `${baseUrl}/shrimp_salt.png`,
      priceEur: 1.8,
      priceUsd: 2.0,
      optionName: "Đóng gói",
      variantName: "Hũ 150g",
      sku: "MO-TN-150G"
    },
    {
      title: "Muối ớt xanh hải sản Nha Trang",
      description: "Nước muối ớt xiêm xanh cay nồng chua ngọt sệt mịn chấm hải sản luộc, hấp cực đã.",
      handle: "muoi-ot-xanh-hai-san",
      weight: 200,
      image: `${baseUrl}/shrimp_salt.png`,
      priceEur: 2.0,
      priceUsd: 2.2,
      optionName: "Đóng gói",
      variantName: "Chai 200g",
      sku: "MOX-NT-200G"
    },
    {
      title: "Muối tiêu lá chanh Tây Ninh thơm mát",
      description: "Sự kết hợp thơm mát giữa muối sấy, tiêu sọ đen giòn và lá chanh tươi cắt sợi sấy khô.",
      handle: "muoi-tieu-la-chanh-tayninh",
      weight: 120,
      image: `${baseUrl}/shrimp_salt.png`,
      priceEur: 1.8,
      priceUsd: 2.0,
      optionName: "Đóng gói",
      variantName: "Hũ 120g",
      sku: "MTLC-120G"
    },
    {
      title: "Muối tiêu dưỡng sinh Tây Ninh chất lượng",
      description: "Muối sấy tiêu đen dưỡng sinh đặc biệt nhiều khoáng chất có lợi cho sức khỏe, ăn kèm trứng vịt lộn cực chuẩn.",
      handle: "muoi-tieu-duong-sinh-tayninh",
      weight: 120,
      image: `${baseUrl}/shrimp_salt.png`,
      priceEur: 1.9,
      priceUsd: 2.1,
      optionName: "Đóng gói",
      variantName: "Hũ 120g",
      sku: "MTDS-120G"
    },
    {
      title: "Muối vừng lạc truyền thống Việt Nam",
      description: "Muối vừng lạc truyền thống làm từ vừng vàng thơm nức và lạc quê sấy giòn giã nhỏ.",
      handle: "muoi-vung-lac-truyen-thong",
      weight: 250,
      image: `${baseUrl}/shrimp_salt.png`,
      priceEur: 2.5,
      priceUsd: 2.8,
      optionName: "Đóng gói",
      variantName: "Hũ 250g",
      sku: "MVL-250G"
    },
    {
      title: "Muối mè rong biển đặc biệt bổ dưỡng",
      description: "Muối vừng đen kết hợp rong biển Nhật Bản sấy khô thơm ngậy béo ngậy, ăn chay cực tốt.",
      handle: "muoi-me-rong-bien-dac-biet",
      weight: 250,
      image: `${baseUrl}/shrimp_salt.png`,
      priceEur: 3.0,
      priceUsd: 3.4,
      optionName: "Đóng gói",
      variantName: "Hũ 250g",
      sku: "MMRB-250G"
    }
  ];

  logger.info("Checking for existing products to prevent duplicates...");
  const productsToCreate: any[] = [];

  for (const rawProduct of rawProducts) {
    const { data: existingProducts } = await query.graph({
      entity: "product",
      fields: ["id", "handle"],
      filters: { handle: rawProduct.handle },
    });

    if (existingProducts.length > 0) {
      logger.warn(`Product with handle '${rawProduct.handle}' already exists, skipping.`);
      continue;
    }

    productsToCreate.push({
      title: rawProduct.title,
      category_ids: [categoryId],
      description: rawProduct.description,
      handle: rawProduct.handle,
      weight: rawProduct.weight,
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      images: [
        {
          url: rawProduct.image,
        },
      ],
      options: [
        {
          title: rawProduct.optionName,
          values: [rawProduct.variantName],
        },
      ],
      variants: [
        {
          title: rawProduct.variantName,
          sku: rawProduct.sku,
          options: {
            [rawProduct.optionName]: rawProduct.variantName,
          },
          prices: [
            {
              amount: rawProduct.priceEur,
              currency_code: "eur",
            },
            {
              amount: rawProduct.priceUsd,
              currency_code: "usd",
            },
          ],
        },
      ],
      sales_channels: [{ id: defaultSalesChannel.id }],
    });
  }

  if (productsToCreate.length > 0) {
    logger.info(`Creating ${productsToCreate.length} new products...`);
    await createProductsWorkflow(container).run({
      input: {
        products: productsToCreate,
      },
    });
    logger.info("Products seeded successfully!");
  } else {
    logger.info("No new products to create.");
  }

  logger.info("Vietnamese specialties seeding run completed!");
}
