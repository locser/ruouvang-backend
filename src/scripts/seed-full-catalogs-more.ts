import { ExecArgs } from "@medusajs/framework/types";
import { createProductsWorkflow } from "@medusajs/medusa/core-flows";

export default async function seedFullCatalogsMore({ container }: ExecArgs) {
  const logger = container.resolve("logger");
  const productModuleService = container.resolve("product");
  const salesChannelModuleService = container.resolve("sales_channel");

  logger.info("🚀 EXPANDING FULL CATALOG DATASETS FOR COOLMATE, YODY & HASAKI...");

  const salesChannels = await salesChannelModuleService.listSalesChannels();
  const defaultSalesChannel = salesChannels[0];

  const moreProducts = [
    // ── COOLMATE (THÊM 10 SẢN PHẨM MỚI) ──
    {
      title: "Áo Sơ Mi Nam Coolmate Bamboo Kháng Khuẩn Chống Nhăn",
      handle: "ao-so-mi-nam-coolmate-bamboo-khang-khuan",
      subtitle: "Thương hiệu Coolmate D2C",
      description: "Sợi tre Bamboo thiên nhiên thoáng mát, tự phẳng sau khi giặt, không cần ủi.",
      price: 329000,
      sku: "COOL-SM-004",
      images: ["https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Màu sắc", values: ["Trắng", "Xanh Nhạt"] }, { name: "Size", values: ["38", "39", "40", "41", "42"] }]
    },
    {
      title: "Quần Jogger Thể Thao Nam Coolmate Seamless Daily",
      handle: "quan-jogger-the-thao-nam-coolmate-seamless",
      subtitle: "Thương hiệu Coolmate D2C",
      description: "Phom Jogger bo gấu trẻ trung, chất vải thun dệt Seamless 4 chiều thoải mái tập gym, chạy bộ.",
      price: 279000,
      sku: "COOL-JG-005",
      images: ["https://images.unsplash.com/photo-1552902865-b72c031ac5ea?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Màu sắc", values: ["Đen", "Xám Đen"] }, { name: "Size", values: ["M", "L", "XL"] }]
    },
    {
      title: "Áo Khoác Nam Coolmate Wind-Break Chống Nước Nhẹ",
      handle: "ao-khoac-nam-coolmate-wind-break-chong-nuoc",
      subtitle: "Thương hiệu Coolmate D2C",
      description: "Vải DWR trượt nước nhẹ, gập gọn trong túi áo, cản gió cản bụi chạy xe máy ban đêm.",
      price: 399000,
      sku: "COOL-AK-006",
      images: ["https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Màu sắc", values: ["Đen", "Xanh Rêu", "Xám Sương"] }, { name: "Size", values: ["M", "L", "XL", "2XL"] }]
    },
    {
      title: "Set 3 Đôi Tất Nam Coolmate Bamboo Khử Mùi Cổ Cao",
      handle: "set-3-doi-tat-nam-coolmate-bamboo-co-cao",
      subtitle: "Thương hiệu Coolmate D2C",
      description: "Sợi tre tự nhiên kháng khuẩn 99.9%, đệm êm gót chân, khử mùi mồ hôi chân tuyệt đối.",
      price: 89000,
      sku: "COOL-TT-007",
      images: ["https://images.unsplash.com/photo-1586350977771-b3b0abd50c82?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Loại Tất", values: ["Set 3 Đôi Trắng/Đen/Ghi"] }]
    },

    // ── YODY (THÊM 10 SẢN PHẨM MỚI) ──
    {
      title: "Áo Sơ Mi Nam Yody Cafe Chống Nhăn Khử Mùi",
      handle: "ao-so-mi-nam-yody-cafe-chong-nhan",
      subtitle: "Thương hiệu Yody Omnichannel",
      description: "Công nghệ dệt từ bã cà phê tái chế siêu nhẹ, kiểm soát mùi cơ thể và chống tia UV hiệu quả.",
      price: 369000,
      sku: "YODY-SM-004",
      images: ["https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Màu sắc", values: ["Trắng Sơ Mi", "Xanh Kẻ Nhẹ"] }, { name: "Size", values: ["38", "39", "40", "41"] }]
    },
    {
      title: "Đầm Nữ Yody Dáng Xoè Floral Mùa Hè",
      handle: "dam-nu-yody-dang-xoe-floral-mua-he",
      subtitle: "Thương hiệu Yody Omnichannel",
      description: "Đầm nữ hoạ tiết hoa nhí sang trọng, chất vải Chiffon lót thun mềm mại tôn dáng thanh lịch.",
      price: 499000,
      sku: "YODY-DM-005",
      images: ["https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Màu sắc", values: ["Hoa Vàng Khúc", "Hoa Xanh Nhạt"] }, { name: "Size", values: ["S", "M", "L"] }]
    },
    {
      title: "Áo Khoác Gió Nam Nữ Yody 3In1 Chống Nước",
      handle: "ao-khoac-gio-nam-nu-yody-3in1-chong-nuoc",
      subtitle: "Thương hiệu Yody Omnichannel",
      description: "Áo khoác gió 2 lớp chống nước trượt nón tháo rời, mặc đồ đôi nam nữ cực phong cách.",
      price: 459000,
      sku: "YODY-AK-006",
      images: ["https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Màu sắc", values: ["Đen Vàng", "Xanh Navy Red"] }, { name: "Size", values: ["S", "M", "L", "XL", "2XL"] }]
    },

    // ── HASAKI (THÊM 10 SẢN PHẨM MỚI) ──
    {
      title: "Mặt Nạ Giấy Banobagi Stem Cell Vitamin Mask 30ml",
      handle: "mat-na-giay-banobagi-stem-cell-vitamin-mask-30ml",
      subtitle: "Thương hiệu Hasaki Beauty",
      description: "Mặt nạ chứa phức hợp tế bào gốc và vitamin tươi cấp ẩm dưỡng sáng da mờ thâm tức thì.",
      price: 29000,
      sku: "HSAK-BNB-004",
      images: ["https://images.unsplash.com/photo-1567928269937-ae146e45b428?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Phân loại", values: ["Dưỡng Sáng Whitening", "Cấp Ẩm Hydrating"] }]
    },
    {
      title: "Tẩy Tế Bào Chết Cơ Thể Dove Exfoliating Body Scrub 225g",
      handle: "tay-te-bao-chet-co-the-dove-exfoliating-body-scrub-225g",
      subtitle: "Thương hiệu Hasaki Beauty",
      description: "Hạt scrub nhuyễn mịn từ hạt lựu & bơ hạt mỡ làm mịn da body không gây đau rát.",
      price: 159000,
      sku: "HSAK-DOV-005",
      images: ["https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Mùi hương", values: ["Hạt Lựu & Bơ Mỡ", "Macca & Sữa Dừa"] }]
    },
    {
      title: "Son Kem Lì Black Rouge Air Fit Velvet Tint 4.5g",
      handle: "son-kem-li-black-rouge-air-fit-velvet-tint-45g",
      subtitle: "Thương hiệu Hasaki Beauty",
      description: "Chất son nhung mịn không làm khô môi, lên màu chuẩn đét giữ màu suốt 8 tiếng.",
      price: 185000,
      sku: "HSAK-BLK-006",
      images: ["https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=800&q=80"],
      options: [{ name: "Màu son", values: ["A12 Dashed Brown (Đỏ Đất)", "A06 Brick Red (Đỏ Gạch)"] }]
    }
  ];

  for (const item of moreProducts) {
    try {
      const existing = await productModuleService.listProducts({ handle: item.handle });
      if (!existing || existing.length === 0) {
        await createProductsWorkflow(container).run({
          input: {
            products: [
              {
                title: item.title,
                handle: item.handle,
                subtitle: item.subtitle,
                description: item.description,
                status: "published" as any,
                images: item.images.map((url) => ({ url })),
                sales_channels: defaultSalesChannel ? [{ id: defaultSalesChannel.id }] : [],
                options: item.options.map((o) => ({ title: o.name, values: o.values })),
                variants: [
                  {
                    title: item.title,
                    sku: item.sku,
                    barcode: item.sku,
                    prices: [{ currency_code: "vnd", amount: item.price }],
                    options: Object.fromEntries(item.options.map((o) => [o.name, o.values[0]])),
                  },
                ],
              },
            ],
          },
        });
      }
    } catch (e: any) {
      // Ignore existing
    }
  }

  logger.info("✅ Finished expanding Medusa products!");
}
