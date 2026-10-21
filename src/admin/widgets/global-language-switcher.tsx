import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect } from "react"

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  MEDUSA ADMIN GUARANTEED GLOBAL LANGUAGE SWITCHER & DEEP I18N ENGINE
 * ═══════════════════════════════════════════════════════════════════════
 *  Tự động gắn Dropdown chọn ngôn ngữ (Tiếng Việt 🇻🇳 / English 🇬🇧 / CSV)
 *  vào góc trên bên phải của TOÀN BỘ trang quản trị Medusa (Port 9000).
 *  Đảm bảo hiển thị 100% ở mọi đường dẫn (Dashboard, Đơn hàng, Sản phẩm,
 *  Khách hàng, Tồn kho, Cấu hình, Bài viết, Trang con...).
 * ═══════════════════════════════════════════════════════════════════════
 */

const STORAGE_LANG_KEY = "vph_medusa_admin_lang"
const STORAGE_CUSTOM_LANGS_KEY = "vph_medusa_admin_custom_langs"

// Master Dictionary sorted with multi-word phrases first
const masterPhrasePairs: [string, string][] = [
  // Multi-word phrases
  ["Publishable API Keys", "Khóa API Công khai"],
  ["Secret API Keys", "Khóa API Bảo mật"],
  ["API Key Management", "Quản lý Khóa API"],
  ["Product Variants", "Biến thể sản phẩm"],
  ["Product Details", "Chi tiết sản phẩm"],
  ["Customer Groups", "Nhóm khách hàng"],
  ["Customer Details", "Chi tiết khách hàng"],
  ["Orders History", "Lịch sử mua hàng"],
  ["Order Details", "Chi tiết đơn hàng"],
  ["Draft Orders", "Đơn hàng nháp"],
  ["Gift Cards", "Thẻ quà tặng"],
  ["Price Lists", "Bảng giá sản phẩm"],
  ["Price List Details", "Chi tiết bảng giá"],
  ["Sales Channels", "Kênh bán hàng"],
  ["Stock Locations", "Địa điểm kho tồn"],
  ["Inventory Items", "Danh mục hàng tồn"],
  ["Inventory Details", "Chi tiết tồn kho"],
  ["Shipping Address", "Địa chỉ giao hàng"],
  ["Billing Address", "Địa chỉ thanh toán"],
  ["Payment Status", "Trạng thái thanh toán"],
  ["Fulfillment Status", "Trạng thái giao hàng"],
  ["Shipping Fee", "Phí vận chuyển"],
  ["Outstanding Amount", "Số tiền nợ"],
  ["Partially Refunded", "Hoàn tiền một phần"],
  ["Partially Fulfilled", "Giao một phần"],
  ["Requires Action", "Cần xử lý"],
  ["Create Order", "Tạo đơn hàng mới"],
  ["Add Product", "Thêm sản phẩm mới"],
  ["Create Product", "Tạo sản phẩm mới"],
  ["Edit Product", "Chỉnh sửa sản phẩm"],
  ["Edit Variants", "Chỉnh sửa biến thể"],
  ["Edit Options", "Chỉnh sửa tùy chọn"],
  ["Add Variant", "Thêm biến thể mới"],
  ["Delete Product", "Xóa sản phẩm"],
  ["Fulfill Items", "Giao hàng cho khách"],
  ["Create Return", "Tạo yêu cầu trả hàng"],
  ["Cancel Order", "Hủy đơn hàng"],
  ["Mark as Paid", "Đánh dấu đã thanh toán"],
  ["Capture Payment", "Xác nhận thu tiền"],
  ["Edit Customer", "Chỉnh sửa khách hàng"],
  ["Delete Customer", "Xóa khách hàng"],
  ["Update Quantity", "Cập nhật số lượng"],
  ["Reserve Items", "Đặt trước sản phẩm"],
  ["Add Location", "Thêm kho hàng mới"],
  ["Promotion Details", "Chi tiết khuyến mãi"],
  ["Usage Limit", "Giới hạn sử dụng"],
  ["Valid From", "Hiệu lực từ ngày"],
  ["Valid Until", "Hiệu lực đến ngày"],
  ["Add Prices", "Thêm bảng giá mới"],
  ["Store Details", "Chi tiết Cửa hàng"],
  ["Store Name", "Tên Cửa hàng"],
  ["Default Region", "Khu vực mặc định"],
  ["Add Region", "Thêm khu vực mới"],
  ["Add Sales Channel", "Thêm kênh bán hàng"],
  ["Add User", "Thêm nhân viên"],
  ["Invite User", "Mời nhân viên gia nhập"],
  ["Super Admin", "Quản trị cao cấp"],
  ["Page Builder", "Trình dựng trang"],
  ["Language Manager", "Quản lý Ngôn ngữ"],
  ["In Stock", "Còn hàng"],
  ["Out of Stock", "Hết hàng"],
  ["Save Changes", "Lưu thay đổi"],

  // Single terms
  ["Orders", "Đơn hàng"],
  ["Products", "Sản phẩm"],
  ["Categories", "Danh mục sản phẩm"],
  ["Collections", "Bộ sưu tập"],
  ["Customers", "Khách hàng"],
  ["Inventory", "Tồn kho"],
  ["Reservations", "Đặt trước kho"],
  ["Promotions", "Khuyến mãi"],
  ["Campaigns", "Chiến dịch"],
  ["Settings", "Cấu hình hệ thống"],
  ["Store", "Cửa hàng"],
  ["Regions", "Khu vực"],
  ["Taxes", "Thuế & Phí"],
  ["Locations", "Kho hàng"],
  ["Shipping", "Vận chuyển"],
  ["Users", "Tài khoản"],
  ["Workflows", "Quy trình"],
  ["Blog", "Bài viết"],
  ["Thumbnail", "Ảnh đại diện"],
  ["Media", "Thư viện ảnh"],
  ["Organize", "Phân loại"],
  ["Variant", "Biến thể"],
  ["Material", "Chất liệu"],
  ["Weight", "Trọng lượng"],
  ["Length", "Chiều dài"],
  ["Width", "Chiều rộng"],
  ["Height", "Chiều cao"],
  ["Fulfillments", "Giao hàng"],
  ["Returns", "Trả hàng"],
  ["Claims", "Khiếu nại"],
  ["Exchanges", "Đổi hàng"],
  ["Payment", "Thanh toán"],
  ["Summary", "Tóm tắt"],
  ["Timeline", "Dòng thời gian"],
  ["Total", "Tổng tiền"],
  ["Items", "Sản phẩm"],
  ["Subtotal", "Tạm tính"],
  ["Discount", "Giảm giá"],
  ["Tax", "Thuế"],
  ["Paid", "Đã thanh toán"],
  ["Unpaid", "Chưa thanh toán"],
  ["Refunded", "Đã hoàn tiền"],
  ["Fulfilled", "Đã giao hàng"],
  ["Canceled", "Đã hủy đơn"],
  ["Addresses", "Địa chỉ"],
  ["Registered", "Đã đăng ký"],
  ["Reserved", "Đã đặt trước"],
  ["Available", "Có sẵn"],
  ["Rules", "Quy tắc"],
  ["Conditions", "Điều kiện"],
  ["Code", "Mã khuyến mãi"],
  ["Percentage", "Phần trăm"],
  ["Amount", "Số tiền"],
  ["Currency", "Tiền tệ"],
  ["Role", "Vai trò"],
  ["Member", "Thành viên"],
  ["Admin", "Quản trị viên"],
  ["Title", "Tiêu đề"],
  ["Description", "Mô tả"],
  ["Price", "Giá tiền"],
  ["Quantity", "Số lượng"],
  ["Status", "Trạng thái"],
  ["Actions", "Hành động"],
  ["Created", "Ngày tạo"],
  ["Updated", "Cập nhật"],
  ["Save", "Lưu lại"],
  ["Cancel", "Hủy bỏ"],
  ["Edit", "Chỉnh sửa"],
  ["Delete", "Xóa"],
  ["Remove", "Gỡ bỏ"],
  ["Search...", "Tìm kiếm..."],
  ["Search", "Tìm kiếm"],
  ["Filter", "Bộ lọc"],
  ["Export", "Xuất file"],
  ["Import", "Nhập file"],
  ["Active", "Đang hoạt động"],
  ["Disabled", "Đã tắt"],
  ["Draft", "Bản nháp"],
  ["Published", "Đã xuất bản"],
  ["Completed", "Hoàn thành"],
  ["Pending", "Đang xử lý"]
]

// Chỉ giữ cặp mà bản dịch KHÔNG chứa chính chuỗi gốc. Nếu không, mỗi lần quét lại
// sẽ thay tiếp và chuỗi phình ra mãi (ví dụ "Blog" → "Bài viết Blog" → "Bài viết Bài viết Blog").
const safePhrasePairs = masterPhrasePairs.filter(([en, vi]) => !vi.includes(en))

/**
 * Medusa Admin đọc ngôn ngữ từ cookie/localStorage khoá `lng` (xem i18n/config.ts của
 * @medusajs/dashboard), KHÔNG đọc `i18nextLng`. Bản cũ chỉ ghi `i18nextLng` và quét thay
 * từng từ trên trang, nên giao diện vẫn là tiếng Anh pha vài từ Việt ("Thanh toán of … will
 * be captured"). Nay ghi đúng `lng` để Medusa dùng bản dịch tiếng Việt chính thức.
 * Trả về true nếu vừa đổi (cần tải lại trang để áp dụng).
 */
function datNgonNguMedusa(lang: string): boolean {
  const dang = localStorage.getItem("lng")
  localStorage.setItem("lng", lang)
  document.cookie = `lng=${lang}; path=/; max-age=31536000; SameSite=Lax`
  return dang !== lang
}

// Global DOM recursive translation executor with loop guard
let isTranslating = false
const DUNG_QUET_THAY_TU = false

function executeDomTranslation(lang: string) {
  // ĐÃ TẮT: Medusa có bản dịch tiếng Việt chính thức (xem datNgonNguMedusa). Quét thay từng từ
  // đè lên bản đó và sinh câu nửa Việt nửa Anh.
  if (!DUNG_QUET_THAY_TU) return
  if (lang !== "vi" || isTranslating) return // Prevent recursive mutation loop

  try {
    isTranslating = true

    const scanNode = (node: Node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element
        if (el.id === "vph-global-lang-container" || el.closest("#vph-global-lang-container")) return

        if (el.hasAttribute("placeholder")) {
          let ph = el.getAttribute("placeholder") || ""
          safePhrasePairs.forEach(([en, vi]) => {
            if (ph.includes(en)) ph = ph.replaceAll(en, vi)
          })
          el.setAttribute("placeholder", ph)
        }
      }

      if (node.nodeType === Node.TEXT_NODE) {
        let val = node.nodeValue || ""
        if (!val.trim()) return

        let modified = val
        safePhrasePairs.forEach(([en, vi]) => {
          if (modified.includes(en)) {
            modified = modified.replaceAll(en, vi)
          }
        })

        if (modified !== val) {
          node.nodeValue = modified
        }
      } else {
        node.childNodes.forEach(scanNode)
      }
    }

    scanNode(document.body)
  } catch (err) {
    console.error("[VPH i18n Engine] Error during translation:", err)
  } finally {
    isTranslating = false
  }
}

// Inject Floating Language Switcher Dropdown Control
function mountFloatingLanguageControl() {
  try {
    if (document.getElementById("vph-global-lang-container")) return

    const container = document.createElement("div")
    container.id = "vph-global-lang-container"
    container.style.cssText = `
      position: fixed;
      top: 12px;
      right: 140px;
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 8px;
      background: #ffffff;
      padding: 4px 10px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
    `

    const select = document.createElement("select")
    select.id = "vph-lang-select-control"
    select.style.cssText = `
      border: none;
      outline: none;
      background: transparent;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      padding: 2px 4px;
      color: #1e293b;
    `

    const currentLang = localStorage.getItem(STORAGE_LANG_KEY) || "vi"

    select.innerHTML = `
      <option value="vi" ${currentLang === "vi" ? "selected" : ""}>🇻🇳 Tiếng Việt</option>
      <option value="en" ${currentLang === "en" ? "selected" : ""}>🇬🇧 English</option>
    `

    select.addEventListener("change", (e) => {
      const val = (e.target as HTMLSelectElement).value
      localStorage.setItem(STORAGE_LANG_KEY, val)
      localStorage.setItem("i18nextLng", val)
      datNgonNguMedusa(val)
      window.location.reload()
    })

    container.appendChild(select)
    document.body.appendChild(container)
  } catch (e) {
    console.error("[VPH i18n Engine] Error mounting control:", e)
  }
}

const GlobalLanguageSwitcherWidget = () => {
  useEffect(() => {
    mountFloatingLanguageControl()

    // Lần đầu (hoặc khi Medusa chưa ở đúng ngôn ngữ đã chọn) thì ghi `lng` rồi tải lại một lần.
    const currentLang = localStorage.getItem(STORAGE_LANG_KEY) || "vi"
    if (datNgonNguMedusa(currentLang)) {
      window.location.reload()
      return
    }

    let debounceTimer: any = null
    const observer = new MutationObserver(() => {
      if (isTranslating) return // Ignore mutations while translating

      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        mountFloatingLanguageControl()
        const activeLang = localStorage.getItem(STORAGE_LANG_KEY) || "vi"
        if (activeLang === "vi") {
          executeDomTranslation("vi")
        }
      }, 200)
    })

    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      observer.disconnect()
    }
  }, [])

  return null
}

export const config = defineWidgetConfig({
  zone: [
    "product.list.before",
    "product.details.before",
    "order.list.before",
    "order.details.before",
    "customer.list.before",
    "customer.details.before",
    "inventory.list.before",
    "inventory.details.before",
    "promotion.list.before",
    "promotion.details.before",
  ],
})

export default GlobalLanguageSwitcherWidget
