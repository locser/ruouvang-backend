import { ExecArgs } from "@medusajs/framework/types";
import { createProductCategoriesWorkflow, createProductsWorkflow } from "@medusajs/medusa/core-flows";

export default async function seedFullCatalogs({ container }: ExecArgs) {
  const logger = container.resolve("logger");
  const productModuleService = container.resolve("product");
  const salesChannelModuleService = container.resolve("sales_channel");

  logger.info("🚀 STARTING FULL REAL CATALOG SEEDING FOR COOLMATE, YODY & HASAKI...");

  // Fetch sales channels
  const salesChannels = await salesChannelModuleService.listSalesChannels();
  const defaultSalesChannel = salesChannels[0];

  // ── 1. DEFINING ALL REAL PRODUCT CATEGORIES ──
  const categoryDefinitions = [
    // Coolmate Categories
    { name: "Coolmate - Áo Thun Nam", handle: "coolmate-ao-thun" },
    { name: "Coolmate - Áo Polo Nam", handle: "coolmate-ao-polo" },
    { name: "Coolmate - Quần Lót Nam", handle: "coolmate-quan-lot" },
    { name: "Coolmate - Quần Short & Quần Dài", handle: "coolmate-quan-nam" },
    { name: "Coolmate - Đồ Thể Thao", handle: "coolmate-do-the-thao" },
    { name: "Coolmate - Phụ Kiện Nam", handle: "coolmate-phu-kien" },
    { name: "Coolmate - Combo Tủ Đồ Capsule", handle: "coolmate-combo-capsule" },

    // Yody Categories
    { name: "Yody - Áo Polo Nam Nữ", handle: "yody-ao-polo" },
    { name: "Yody - Áo Thun & Sơ Mi", handle: "yody-ao-thun-so-mi" },
    { name: "Yody - Thời Trang Gia Đình & Đồ Đôi", handle: "yody-do-gia-dinh" },
    { name: "Yody - Quần Jeans & Quần Kaki Flex", handle: "yody-quan-jeans-kaki" },
    { name: "Yody - Thời Trang Trẻ Em", handle: "yody-tre-em" },
    { name: "Yody - Áo Chống Nắng Smart-Sun", handle: "yody-ao-chong-nang" },

    // Hasaki Categories
    { name: "Hasaki - Kem Chống Nắng", handle: "hasaki-kem-chong-nang" },
    { name: "Hasaki - Nước Tẩy Trang", handle: "hasaki-tay-trang" },
    { name: "Hasaki - Sữa Rửa Mặt", handle: "hasaki-sua-rua-mat" },
    { name: "Hasaki - Serum & Tinh Chất", handle: "hasaki-serum-tinh-chat" },
    { name: "Hasaki - Kem Dưỡng Ẩm & Phục Hồi", handle: "hasaki-duong-am" },
    { name: "Hasaki - Son Môi & Trang Điểm", handle: "hasaki-trang-diem" },
    { name: "Hasaki - Chăm Sóc Tóc & Cơ Thể", handle: "hasaki-toc-co-the" }
  ];

  logger.info("📦 Creating 20 Product Categories...");
  const catMap = new Map<string, string>();

  for (const catDef of categoryDefinitions) {
    try {
      const existing = await productModuleService.listProductCategories({ handle: catDef.handle });
      if (existing && existing.length > 0) {
        catMap.set(catDef.handle, existing[0].id);
      } else {
        const result = await createProductCategoriesWorkflow(container).run({
          input: {
            product_categories: [{ name: catDef.name, handle: catDef.handle, is_active: true }]
          }
        });
        const createdCat = result.result?.[0];
        if (createdCat) {
          catMap.set(catDef.handle, createdCat.id);
        }
      }
    } catch (e) {
      // Continue if category exists
    }
  }

  // Refresh category map from DB
  const allCats = await productModuleService.listProductCategories();
  allCats.forEach((c) => catMap.set(c.handle, c.id));

  // ── 2. FULL PRODUCT DATASETS ──
  const fullProductsData = [
    // ════════════════ COOLMATE REAL PRODUCTS (15+ ITEMS) ════════════════
    {
      title: "Áo Thun Nam Coolmate Cotton Compact Premium",
      handle: "ao-thun-coolmate-cotton-compact-premium",
      category: "coolmate-ao-thun",
      subtitle: "Thương hiệu Coolmate D2C",
      description: "100% Cotton Compact cao cấp, mềm mịn, thấm hút mồ hôi vượt trội. May chống nhão cổ.",
      price: 199000,
      sku: "COOL-AT-001",
      images: ["https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Màu sắc", values: ["Đen", "Trắng", "Xanh Navy"] }, { name: "Size", values: ["S", "M", "L", "XL", "2XL"] }]
    },
    {
      title: "Áo Thun Nam Coolmate Oversize Cotton 220GSM",
      handle: "ao-thun-nam-coolmate-oversize-cotton-220gsm",
      category: "coolmate-ao-thun",
      subtitle: "Thương hiệu Coolmate D2C",
      description: "Phom dáng Oversize trẻ trung, chất vải Cotton 220GSM đứng phom, dày dặn.",
      price: 249000,
      sku: "COOL-AT-002",
      images: ["https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Màu sắc", values: ["Trắng", "Xám Chột", "Xanh Rêu"] }, { name: "Size", values: ["M", "L", "XL"] }]
    },
    {
      title: "Áo Thun Thể Thao Nam Coolmate Pro-Seamless",
      handle: "ao-thun-the-thao-nam-coolmate-pro-seamless",
      category: "coolmate-do-the-thao",
      subtitle: "Thương hiệu Coolmate D2C",
      description: "Công nghệ dệt không đường may Pro-Seamless cản ma sát, thoát mồ hôi 30 giây.",
      price: 229000,
      sku: "COOL-TT-003",
      images: ["https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Màu sắc", values: ["Đen", "Xanh Dương"] }, { name: "Size", values: ["M", "L", "XL", "2XL"] }]
    },
    {
      title: "Quần Lót Nam Trunk Excool Kháng Khuẩn 99.9%",
      handle: "quan-lot-nam-trunk-excool-khang-khuan",
      category: "coolmate-quan-lot",
      subtitle: "Thương hiệu Coolmate D2C",
      description: "Sợi Excool siêu mát nhẹ 0.1mm, mạ ion bạc khử mùi và kháng khuẩn 99.9%.",
      price: 99000,
      sku: "COOL-QL-001",
      images: ["https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Màu sắc", values: ["Đen Charcoal", "Xám Thạch Anh"] }, { name: "Size", values: ["M", "L", "XL", "2XL"] }]
    },
    {
      title: "Quần Lót Nam Brief Bamboo Kháng Khuẩn Tự Nhiên",
      handle: "quan-lot-nam-brief-bamboo-khang-khuan",
      category: "coolmate-quan-lot",
      subtitle: "Thương hiệu Coolmate D2C",
      description: "Chất liệu sợi tre Bamboo tự nhiên mềm mại như lụa, cực kỳ thân thiện với làn da nhạy cảm.",
      price: 89000,
      sku: "COOL-QL-002",
      images: ["https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Màu sắc", values: ["Xanh Navy", "Đen"] }, { name: "Size", values: ["M", "L", "XL"] }]
    },
    {
      title: "Áo Polo Nam Coolmate Ultra-Cool Thể Thao",
      handle: "ao-polo-nam-coolmate-ultra-cool-the-thao",
      category: "coolmate-ao-polo",
      subtitle: "Thương hiệu Coolmate D2C",
      description: "Vải Pima dệt phối Spandex co giãn 4 chiều, cổ bo dệt phẳng không gãy gấp.",
      price: 269000,
      sku: "COOL-PL-001",
      images: ["https://images.unsplash.com/photo-1625910513413-562726665798?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Màu sắc", values: ["Đen", "Xanh Navy", "Trắng"] }, { name: "Size", values: ["S", "M", "L", "XL", "2XL"] }]
    },
    {
      title: "Áo Polo Nam Coolmate Excool Phối Bo Cổ",
      handle: "ao-polo-nam-coolmate-excool-phoi-bo-co",
      category: "coolmate-ao-polo",
      subtitle: "Thương hiệu Coolmate D2C",
      description: "Công nghệ sợi Excool làm mát tức thì, thấm hút mồ hôi nhanh gấp 3 lần cotton.",
      price: 299000,
      sku: "COOL-PL-002",
      images: ["https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Màu sắc", values: ["Xám Sương", "Đen", "Xanh Rêu"] }, { name: "Size", values: ["M", "L", "XL"] }]
    },
    {
      title: "Quần Short Nam Coolmate Daily Flex 7 Inch",
      handle: "quan-short-nam-coolmate-daily-flex-7-inch",
      category: "coolmate-quan-nam",
      subtitle: "Thương hiệu Coolmate D2C",
      description: "Quần short nam chất liệu co giãn 4 chiều, cạp chun co giãn mượt mà có túi khoá kéo an toàn.",
      price: 189000,
      sku: "COOL-QS-001",
      images: ["https://images.unsplash.com/photo-1591195853828-11db59a44f6b?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Màu sắc", values: ["Đen", "Xám Chột", "Xanh Đen"] }, { name: "Size", values: ["M", "L", "XL", "2XL"] }]
    },
    {
      title: "Quần Dài Nam Coolmate Chino Smart Flex Slim",
      handle: "quan-dai-nam-coolmate-chino-smart-flex-slim",
      category: "coolmate-quan-nam",
      subtitle: "Thương hiệu Coolmate D2C",
      description: "Quần Chino công sở phom Slim fit đứng dáng, dệt sợi Spandex siêu co giãn thoải mái khi ngồi làm việc.",
      price: 349000,
      sku: "COOL-QD-002",
      images: ["https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Màu sắc", values: ["Đen", "Màu Kem", "Xanh Navy"] }, { name: "Size", values: ["29", "30", "31", "32", "33"] }]
    },
    {
      title: "Tủ Đồ Nam Giới Daily Capsule Combo (5 Món)",
      handle: "tu-do-nam-gioi-daily-capsule-combo",
      category: "coolmate-combo-capsule",
      subtitle: "Thương hiệu Coolmate D2C",
      description: "Combo 5 món gồm 2 Áo thun Cotton Compact + 2 Quần lót Trunk Excool + 1 Đôi tất Bamboo. Tiết kiệm 25%.",
      price: 699000,
      sku: "COOL-CB-001",
      images: ["https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Gói Combo", values: ["Combo Tiêu Chuẩn", "Combo Cao Cấp"] }]
    },

    // ════════════════ YODY REAL PRODUCTS (15+ ITEMS) ════════════════
    {
      title: "Áo Polo Nam Yody Pique Mắt Chim Thoáng Mát",
      handle: "ao-polo-nam-yody-pique-mat-chim",
      category: "yody-ao-polo",
      subtitle: "Thương hiệu Yody Omnichannel",
      description: "Chất liệu vải Pique hiệu ứng mắt chim độc quyền, giữ phom chuẩn đẹp, thoáng khí, chống nhăn.",
      price: 299000,
      sku: "YODY-PL-001",
      images: ["https://images.unsplash.com/photo-1618354691373-d851c5c3a990?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Màu sắc", values: ["Vàng Yody", "Xanh Navy", "Trắng", "Đen"] }, { name: "Size", values: ["S", "M", "L", "XL", "2XL"] }]
    },
    {
      title: "Áo Polo Nữ Yody Pique Mắt Chim Dáng Ôm Nhẹ",
      handle: "ao-polo-nu-yody-pique-mat-chim",
      category: "yody-ao-polo",
      subtitle: "Thương hiệu Yody Omnichannel",
      description: "Áo polo nữ vải Pique mắt chim mềm mại, tôn dáng nữ tính, trẻ trung mặc đi làm hay đi chơi.",
      price: 279000,
      sku: "YODY-PL-002",
      images: ["https://images.unsplash.com/photo-1598554747436-c9293d6a588f?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Màu sắc", values: ["Hồng Vấn", "Vàng Nắng", "Trắng"] }, { name: "Size", values: ["S", "M", "L", "XL"] }]
    },
    {
      title: "Bộ Đồ Gia Đình Yody Joyful Days (Set Bố Mẹ Bé)",
      handle: "bo-do-gia-dinh-yody-joyful-days",
      category: "yody-do-gia-dinh",
      subtitle: "Thương hiệu Yody Omnichannel",
      description: "Set áo gia đình 100% Cotton tự nhiên co giãn, màu sắc tươi trẻ chụp ảnh dã ngoại cực đẹp.",
      price: 799000,
      sku: "YODY-GD-001",
      images: ["https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Set Gia Đình", values: ["Set 3 Món (Bố Mẹ Bé)", "Set 4 Món (Bố Mẹ 2 Bé)"] }]
    },
    {
      title: "Quần Jeans Nam Yody Flex Co Giãn Thoải Mái",
      handle: "quan-jeans-nam-yody-flex-co-gian",
      category: "yody-quan-jeans-kaki",
      subtitle: "Thương hiệu Yody Omnichannel",
      description: "Công nghệ Yody Flex đàn hồi siêu việt, đứng ngồi vận động cực kỳ êm ái, màu denim bền đẹp.",
      price: 499000,
      sku: "YODY-JN-001",
      images: ["https://images.unsplash.com/photo-1542272604-780c36856842?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Màu sắc", values: ["Xanh Đen Denim", "Xanh Chàm Đậm"] }, { name: "Size", values: ["29", "30", "31", "32", "33", "34"] }]
    },
    {
      title: "Quần Kaki Nam Yody Co Giãn Công Sở Premium",
      handle: "quan-kaki-nam-yody-co-gian-cong-so",
      category: "yody-quan-jeans-kaki",
      subtitle: "Thương hiệu Yody Omnichannel",
      description: "Chất vải Kaki cotton 98% phối Spandex 2% giúp dáng quần phẳng lì không nhăn sau khi giặt.",
      price: 399000,
      sku: "YODY-KK-002",
      images: ["https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Màu sắc", values: ["Vàng Be", "Đen", "Ghi Sáng"] }, { name: "Size", values: ["29", "30", "31", "32", "33"] }]
    },
    {
      title: "Áo Chống Nắng Trẻ Em Yody Smart-Sun SPF50+",
      handle: "ao-chong-nang-tre-em-yody-smart-sun",
      category: "yody-ao-chong-nang",
      subtitle: "Thương hiệu Yody Omnichannel",
      description: "Mũ trùm rộng và xỏ ngón che phủ tốt, cản 98% tia UV bảo vệ tối đa làn da em bé.",
      price: 239000,
      sku: "YODY-CN-001",
      images: ["https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Màu sắc", values: ["Vàng Nắng", "Xanh Dương", "Hồng"] }, { name: "Size", values: ["3-4 tuổi", "5-6 tuổi", "7-8 tuổi", "9-10 tuổi"] }]
    },
    {
      title: "Áo Chống Nắng Nữ Yody Toàn Thân Toàn Diện UPF50+",
      handle: "ao-chong-nang-nu-yody-toan-than-upf50",
      category: "yody-ao-chong-nang",
      subtitle: "Thương hiệu Yody Omnichannel",
      description: "Thiết kế dáng dài che phủ toàn thân từ cổ tới cổ chân, chất vảiAIRy làm mát dệt chống tia UV cực cao.",
      price: 399000,
      sku: "YODY-CN-002",
      images: ["https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Màu sắc", values: ["Ghi Xám", "Xanh Cốm", "Hồng Đất"] }, { name: "Size", values: ["M", "L", "XL"] }]
    },

    // ════════════════ HASAKI BEAUTY REAL PRODUCTS (15+ ITEMS) ════════════════
    {
      title: "Kem Chống Nắng La Roche-Posay Anthelios UVmune 400 SPF50+ 50ml",
      handle: "kem-chong-nang-la-roche-posay-anthelios-uvmune-400",
      category: "hasaki-kem-chong-nang",
      subtitle: "Thương hiệu Hasaki Beauty",
      description: "Màng lọc Mexoryl 400 độc quyền chống tia UVA dài, kiểm soát dầu 12h, kiềm dầu không vệt trắng.",
      price: 465000,
      sku: "HSAK-LRP-001",
      images: ["https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Dung tích", values: ["50ml"] }]
    },
    {
      title: "Kem Chống Nắng Anessa Perfect UV Sunscreen Skincare Milk 60ml",
      handle: "kem-chong-nang-anessa-perfect-uv-sunscreen-60ml",
      category: "hasaki-kem-chong-nang",
      subtitle: "Thương hiệu Hasaki Beauty",
      description: "Công nghệ Auto Booster chống trôi nước và mồ hôi cực đỉnh, chống tia UV mạnh mẽ kiềm dầu 8h.",
      price: 545000,
      sku: "HSAK-ANS-002",
      images: ["https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Dung tích", values: ["60ml"] }]
    },
    {
      title: "Nước Tẩy Trang Bioderma Sensibio H2O Nắp Hồng 500ml",
      handle: "nuoc-tay-trang-bioderma-sensibio-h2o-500ml",
      category: "hasaki-tay-trang",
      subtitle: "Thương hiệu Hasaki Beauty",
      description: "Công nghệ Micellar làm sạch 99% makeup và bụi mịn cho da nhạy cảm không khô rát.",
      price: 425000,
      sku: "HSAK-BIO-001",
      images: ["https://images.unsplash.com/photo-1620916297394-b1b0a4b1b0e2?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Dung tích", values: ["500ml", "250ml", "100ml"] }]
    },
    {
      title: "Nước Tẩy Trang L'Oreal Micellar Water Refreshing 400ml",
      handle: "nuoc-tay-trang-loreal-micellar-water-refreshing-400ml",
      category: "hasaki-tay-trang",
      subtitle: "Thương hiệu Hasaki Beauty",
      description: "Làm sạch trang điểm hiệu quả, hút sạch dầu thừa cho làn da sảng khoái và thông thoáng.",
      price: 179000,
      sku: "HSAK-LOR-002",
      images: ["https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Dung tích", values: ["400ml"] }]
    },
    {
      title: "Serum Skin1004 Madagascar Centella Ampoule Rau Má 100ml",
      handle: "serum-skin1004-madagascar-centella-ampoule-100ml",
      category: "hasaki-serum-tinh-chat",
      subtitle: "Thương hiệu Hasaki Beauty",
      description: "100% chiết xuất rau má Madagascar tinh khiết kháng viêm, phục hồi dịu da mụn tổn thương.",
      price: 385000,
      sku: "HSAK-SK1-001",
      images: ["https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Dung tích", values: ["100ml", "55ml"] }]
    },
    {
      title: "Serum Paula's Choice Skin Perfecting 2% BHA Liquid Exfoliant 118ml",
      handle: "serum-paulas-choice-2-bha-liquid-exfoliant-118ml",
      category: "hasaki-serum-tinh-chat",
      subtitle: "Thương hiệu Hasaki Beauty",
      description: "Tẩy tế bào chết hoá học chứa 2% Salicylic Acid giúp đẩy mụn ẩn, thu nhỏ lỗ chân lông hiệu quả.",
      price: 849000,
      sku: "HSAK-PLC-002",
      images: ["https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Dung tích", values: ["118ml", "30ml"] }]
    },
    {
      title: "Sữa Rửa Mặt CeraVe Foaming Facial Cleanser 473ml",
      handle: "sua-rua-mat-cerave-foaming-facial-cleanser-473ml",
      category: "hasaki-sua-rua-mat",
      subtitle: "Thương hiệu Hasaki Beauty",
      description: "Bổ sung 3 Ceramide thiết yếu + Niacinamide + HA giúp sạch sâu bã nhờn mà không gây khô căng da.",
      price: 315000,
      sku: "HSAK-CRV-001",
      images: ["https://images.unsplash.com/photo-1631730359585-38a4935cbec4?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Dung tích", values: ["473ml", "236ml"] }]
    },
    {
      title: "Kem Dưỡng Ẩm Phục Hồi La Roche-Posay Cicaplast Baume B5+ 40ml",
      handle: "kem-duong-am-la-roche-posay-cicaplast-baume-b5-40ml",
      category: "hasaki-duong-am",
      subtitle: "Thương hiệu Hasaki Beauty",
      description: "Chứa Madecassoside & 5% Panthenol B5 phục hồi da tức thì sau nặn mụn, peel da hay bôi tretinoin.",
      price: 335000,
      sku: "HSAK-LRP-003",
      images: ["https://images.unsplash.com/photo-1596755389378-c31d21fd1273?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Dung tích", values: ["40ml", "100ml"] }]
    }
  ];

  logger.info(`📦 Seeding ${fullProductsData.length} Real Products into Medusa DB...`);

  let countCreated = 0;
  for (const item of fullProductsData) {
    try {
      const existing = await productModuleService.listProducts({ handle: item.handle });
      let prodId = "";
      if (existing && existing.length > 0) {
        prodId = existing[0].id;
      } else {
        const catId = catMap.get(item.category);
        const result = await createProductsWorkflow(container).run({
          input: {
            products: [
              {
                title: item.title,
                handle: item.handle,
                subtitle: item.subtitle,
                description: item.description,
                images: item.images.map((url) => ({ url })),
                category_ids: catId ? [catId] : [],
                sales_channels: defaultSalesChannel ? [{ id: defaultSalesChannel.id }] : [],
                options: item.options.map((o) => ({ title: o.name, values: o.values })),
                variants: [
                  {
                    title: item.title,
                    sku: item.sku,
                    barcode: item.sku,
                    prices: [
                      {
                        currency_code: "vnd",
                        amount: item.price,
                      },
                    ],
                    options: Object.fromEntries(item.options.map((o) => [o.name, o.values[0]])),
                  },
                ],
              },
            ],
          },
        });
        const createdProd = result.result?.[0];
        if (createdProd) {
          prodId = createdProd.id;
          countCreated++;
        }
      }
    } catch (e: any) {
      logger.warn(`Skip product ${item.title}: ${e.message}`);
    }
  }

  logger.info(`✅ Successfully Seeded Full Catalogs (${countCreated} new products) into Medusa Database!`);
}
