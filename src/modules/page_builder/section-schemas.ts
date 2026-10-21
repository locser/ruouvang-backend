/**
 * ═══════════════════════════════════════════════════════════════════════
 *  LƯỢC ĐỒ KHỐI NỘI DUNG (Section Schemas)
 * ═══════════════════════════════════════════════════════════════════════
 *  ĐÂY LÀ TRÁI TIM CỦA PAGE BUILDER.
 *
 *  Ý tưởng học từ Shopify Online Store 2.0 (`{% schema %}`):
 *  mỗi khối TỰ MÔ TẢ CHÍNH NÓ — có những thiết lập nào, kiểu gì, mặc
 *  định ra sao. Nhờ vậy:
 *
 *   • Admin TỰ SINH FORM từ lược đồ → thêm khối mới KHÔNG phải viết
 *     thêm một dòng giao diện admin nào.
 *   • Storefront biết chắc hình dạng dữ liệu nó sẽ nhận.
 *   • AI đọc lược đồ là biết sửa được gì, không phải đoán.
 *
 *  THÊM MỘT KHỐI MỚI = 2 việc:
 *   1. Thêm một mục vào SECTION_SCHEMAS ở file này.
 *   2. Viết component tương ứng ở storefront/src/modules/page-builder/sections/
 *  Không đụng tới Admin. Không đụng tới database.
 *
 *  ⚠️ Quy tắc bắt buộc: KHÔNG dùng "" làm giá trị mặc định. Medusa xoá
 *     hẳn khoá khỏi JSON khi nhận chuỗi rỗng. Dùng null.
 * ═══════════════════════════════════════════════════════════════════════
 */

/** Kiểu thiết lập mà Admin biết cách vẽ ra ô nhập */
export type SettingType =
  | "text" // ô chữ 1 dòng
  | "textarea" // ô chữ nhiều dòng
  | "image" // đường dẫn ảnh
  | "url" // liên kết
  | "boolean" // công tắc bật/tắt
  | "number" // ô số
  | "select" // chọn 1 trong danh sách
  | "collection" // chọn bộ sưu tập sản phẩm
  | "color" // mã màu

export type SectionSetting = {
  /** Khoá lưu trong settings JSON */
  id: string
  type: SettingType
  /** Nhãn tiếng Việt hiện trong Admin */
  label: string
  /** Ghi chú giúp người nhập hiểu — hiện dưới ô */
  info?: string
  default?: string | number | boolean | null
  /** Chỉ dùng cho type="select" */
  options?: { value: string; label: string }[]
  /** Trường này dịch được qua Translation Module? (chỉ để hiển thị nhắc nhở) */
  translatable?: boolean
}

export type SectionSchema = {
  type: string
  /** Tên khối hiện trong Admin */
  name: string
  description: string
  settings: SectionSetting[]
  /**
   * Giới hạn số lần khối này được dùng trên 1 trang.
   * null = không giới hạn. Học từ `limit` của Shopify.
   */
  limit?: number | null
}

export const SECTION_SCHEMAS: SectionSchema[] = [
  // ─────────────────────────────────────────────────────── HERO ──────
  {
    type: "hero",
    name: "Khối mở đầu (Hero)",
    description: "Dải lớn đầu trang: tiêu đề, mô tả, nút bấm, ảnh nền.",
    limit: 1,
    settings: [
      {
        id: "heading",
        type: "text",
        label: "Tiêu đề chính",
        default: "Rau củ lên men — nuôi dưỡng từ gốc",
        translatable: true,
      },
      {
        id: "subheading",
        type: "textarea",
        label: "Mô tả phụ",
        default: null,
        translatable: true,
      },
      { id: "image_url", type: "image", label: "Ảnh nền", default: null },
      {
        id: "cta_label",
        type: "text",
        label: "Chữ trên nút",
        default: "Xem sản phẩm",
        translatable: true,
      },
      { id: "cta_url", type: "url", label: "Nút dẫn tới", default: "/store" },
      {
        id: "align",
        type: "select",
        label: "Canh chữ",
        default: "center",
        options: [
          { value: "left", label: "Trái" },
          { value: "center", label: "Giữa" },
          { value: "right", label: "Phải" },
        ],
      },
    ],
  },

  // ────────────────────────────────────────────── LƯỚI SẢN PHẨM ──────
  {
    type: "product_grid",
    name: "Lưới sản phẩm",
    description: "Hiện sản phẩm theo bộ sưu tập. Tên sản phẩm tự dịch theo ngôn ngữ khách chọn.",
    settings: [
      {
        id: "heading",
        type: "text",
        label: "Tiêu đề khối",
        default: "Sản phẩm nổi bật",
        translatable: true,
      },
      {
        id: "collection_handle",
        type: "collection",
        label: "Lấy từ bộ sưu tập",
        info: "Bỏ trống = lấy sản phẩm mới nhất",
        default: null,
      },
      { id: "limit", type: "number", label: "Số sản phẩm hiện ra", default: 8 },
      {
        id: "columns",
        type: "select",
        label: "Số cột",
        default: "4",
        options: [
          { value: "2", label: "2 cột" },
          { value: "3", label: "3 cột" },
          { value: "4", label: "4 cột" },
        ],
      },
      { id: "show_price", type: "boolean", label: "Hiện giá", default: true },
    ],
  },

  // ────────────────────────────────────────── DẢI TIN CẬY (ATTP) ─────
  {
    type: "trust_badges",
    name: "Dải tin cậy (chứng nhận)",
    description:
      "Dải icon + chữ ngắn: chứng nhận ATTP, quy trình, cam kết. Dùng chung cho mọi trang.",
    settings: [
      {
        id: "heading",
        type: "text",
        label: "Tiêu đề khối",
        default: null,
        translatable: true,
      },
      {
        id: "item_1",
        type: "text",
        label: "Mục 1",
        default: "Lên men tự nhiên",
        translatable: true,
      },
      {
        id: "item_2",
        type: "text",
        label: "Mục 2",
        default: "Không chất bảo quản",
        translatable: true,
      },
      {
        id: "item_3",
        type: "text",
        label: "Mục 3",
        default: "Giao lạnh trong 48 giờ",
        translatable: true,
      },
      {
        id: "item_4",
        type: "text",
        label: "Mục 4",
        default: null,
        translatable: true,
      },
    ],
  },

  // ─────────────────────────────────────────────── VĂN BẢN GIÀU ──────
  {
    type: "rich_text",
    name: "Khối văn bản",
    description: "Đoạn chữ dài: câu chuyện thương hiệu, quy trình, hướng dẫn dùng.",
    settings: [
      {
        id: "heading",
        type: "text",
        label: "Tiêu đề",
        default: null,
        translatable: true,
      },
      {
        id: "body",
        type: "textarea",
        label: "Nội dung",
        info: "⚠️ Nội dung ở đây HIỂN THỊ RA KHÁCH — chịu ràng buộc công bố sức khoẻ. Xem tường lửa công bố (claim-guard).",
        default: null,
        translatable: true,
      },
      {
        id: "width",
        type: "select",
        label: "Bề rộng",
        default: "narrow",
        options: [
          { value: "narrow", label: "Hẹp (dễ đọc)" },
          { value: "full", label: "Tràn màn hình" },
        ],
      },
    ],
  },

  // ──────────────────────────────────────────────── DẢI THÔNG BÁO ────
  {
    type: "announcement",
    name: "Dải thông báo",
    description: "Dải mỏng trên cùng: khuyến mãi, lịch giao hàng Tết, thông báo ngưng bán.",
    limit: 1,
    settings: [
      {
        id: "message",
        type: "text",
        label: "Nội dung",
        default: "Giao hàng lạnh nội thành trong 24 giờ",
        translatable: true,
      },
      { id: "link_url", type: "url", label: "Bấm vào dẫn tới", default: null },
      { id: "bg_color", type: "color", label: "Màu nền", default: "#1f3a2e" },
    ],
  },
]

/** Tra lược đồ theo type. Trả undefined nếu không có khối đó. */
export const getSectionSchema = (type: string): SectionSchema | undefined =>
  SECTION_SCHEMAS.find((s) => s.type === type)

/**
 * Dựng settings mặc định cho một khối mới từ lược đồ của nó.
 * Bỏ qua các default = null để không ghi khoá rỗng vào JSON.
 */
export const buildDefaultSettings = (type: string): Record<string, unknown> => {
  const schema = getSectionSchema(type)
  if (!schema) return {}
  const out: Record<string, unknown> = {}
  for (const s of schema.settings) {
    if (s.default !== null && s.default !== undefined) out[s.id] = s.default
  }
  return out
}
