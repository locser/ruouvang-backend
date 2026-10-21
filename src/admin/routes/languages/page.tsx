import { useTranslation } from "react-i18next"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { SquaresPlus } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Select,
  Text,
  Drawer,
  toast,
} from "@medusajs/ui"
import { useState, useEffect } from "react"

type TranslationItem = {
  key: string
  vi: string
  en: string
  custom?: string
}

const defaultTranslations: TranslationItem[] = [
  { key: "nav_dashboard", vi: "Bảng điều khiển", en: "Dashboard" },
  { key: "nav_orders", vi: "Đơn hàng", en: "Orders" },
  { key: "nav_products", vi: "Sản phẩm", en: "Products" },
  { key: "nav_customers", vi: "Khách hàng", en: "Customers" },
  { key: "nav_inventory", vi: "Tồn kho", en: "Inventory" },
  { key: "nav_discounts", vi: "Mã giảm giá", en: "Discounts" },
  { key: "nav_settings", vi: "Cấu hình hệ thống", en: "Settings" },
  { key: "nav_page_builder", vi: "Trình dựng trang", en: "Page Builder" },
  { key: "nav_languages", vi: "Quản lý Ngôn ngữ", en: "Language Manager" },
  { key: "btn_save", vi: "Lưu thay đổi", en: "Save Changes" },
  { key: "btn_cancel", vi: "Hủy bỏ", en: "Cancel" },
  { key: "btn_import_csv", vi: "Nhập CSV Ngôn ngữ", en: "Import Language CSV" },
  { key: "btn_export_template", vi: "Tải CSV Mẫu", en: "Download CSV Template" },
  { key: "status_active", vi: "Đang hoạt động", en: "Active" },
  { key: "status_disabled", vi: "Tắt", en: "Disabled" },
]

const STORAGE_LANG_KEY = "vph_medusa_admin_lang"
const STORAGE_CUSTOM_LANGS_KEY = "vph_medusa_admin_custom_langs"

const MedusaLanguagesPage = () => {
  const { t, i18n } = useTranslation()
  const [currentLang, setCurrentLang] = useState<string>("vi")
  const [customLangs, setCustomLangs] = useState<Record<string, { name: string; dict: Record<string, string> }>>({})
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false)
  
  // CSV Form states
  const [langCode, setLangCode] = useState<string>("")
  const [langName, setLangName] = useState<string>("")
  const [csvContent, setCsvContent] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")

  useEffect(() => {
    const savedLang = localStorage.getItem(STORAGE_LANG_KEY) || "vi"
    setCurrentLang(savedLang)

    try {
      const savedCustom = localStorage.getItem(STORAGE_CUSTOM_LANGS_KEY)
      if (savedCustom) {
        setCustomLangs(JSON.parse(savedCustom))
      }
    } catch (e) {
      console.error("Failed to parse custom languages", e)
    }
  }, [])

  const handleLangChange = (newLang: string) => {
    setCurrentLang(newLang)
    localStorage.setItem(STORAGE_LANG_KEY, newLang)
    toast.success(`Đã chuyển ngôn ngữ giao diện Medusa sang: ${newLang.toUpperCase()}`)
  }

  const handleImportCSV = (e: React.FormEvent) => {
    e.preventDefault()
    const code = langCode.trim().toLowerCase()
    const name = langName.trim() || code.toUpperCase()

    if (!code) {
      toast.error("Mã ngôn ngữ không được để trống!")
      return
    }

    if (!csvContent.trim()) {
      toast.error("Nội dung CSV không được để trống!")
      return
    }

    try {
      const lines = csvContent.split(/\r?\n/)
      const dict: Record<string, string> = {}

      for (let line of lines) {
        line = line.trim()
        if (!line || line.startsWith("#")) continue

        const parts = line.split(",")
        if (parts.length >= 2) {
          const k = parts[0].trim().replace(/^["']|["']$/g, "")
          const v = parts.slice(1).join(",").trim().replace(/^["']|["']$/g, "")
          if (k.toLowerCase() === "key" || k.toLowerCase() === "code") continue
          if (k && v) {
            dict[k] = v
          }
        }
      }

      const count = Object.keys(dict).length
      if (count === 0) {
        toast.error("Không tìm thấy cặp từ khóa (key,translation) hợp lệ trong CSV!")
        return
      }

      const updatedCustom = {
        ...customLangs,
        [code]: { name, dict },
      }

      setCustomLangs(updatedCustom)
      localStorage.setItem(STORAGE_CUSTOM_LANGS_KEY, JSON.stringify(updatedCustom))
      
      setCurrentLang(code)
      localStorage.setItem(STORAGE_LANG_KEY, code)

      toast.success(`🎉 Nhập ngôn ngữ "${name}" thành công với ${count} từ khóa!`)
      setDrawerOpen(false)
      setLangCode("")
      setLangName("")
      setCsvContent("")
    } catch (err: any) {
      toast.error(`Lỗi xử lý file CSV: ${err.message}`)
    }
  }

  const handleDownloadTemplate = () => {
    let csv = "key,translation\n"
    defaultTranslations.forEach((item) => {
      csv += `"${item.key}","${item.vi}"\n`
    })

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "medusa_admin_i18n_template.csv"
    a.click()
    URL.revokeObjectURL(url)
    toast.info("Đã tải xuống file CSV mẫu (medusa_admin_i18n_template.csv)")
  }

  const filteredTranslations = defaultTranslations.filter((t) => {
    const q = searchQuery.toLowerCase()
    return t.key.toLowerCase().includes(q) || t.vi.toLowerCase().includes(q) || t.en.toLowerCase().includes(q)
  })

  return (
    <Container className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 border-b pb-4">
        <div>
          <Heading level="h1" className="text-2xl font-bold flex items-center gap-2">
            🌐 Quản Lý Đa Ngôn Ngữ Medusa Admin (i18n)
          </Heading>
          <Text className="text-ui-fg-subtle text-sm mt-1">
            Cấu hình ngôn ngữ hiển thị cho Medusa Admin Dashboard (Port 9000). Hỗ trợ Tiếng Việt, Tiếng Anh và nhập CSV ngôn ngữ tùy chỉnh.
          </Text>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={handleDownloadTemplate}>
            📋 Tải CSV Mẫu
          </Button>
          <Button variant="primary" onClick={() => setDrawerOpen(true)}>
            📥 Nhập CSV Ngôn Ngữ Mới
          </Button>
        </div>
      </div>

      {/* Active Language Selector Card */}
      <div className="bg-ui-bg-subtle p-5 rounded-lg border mb-6 flex items-center justify-between">
        <div>
          <Text className="font-semibold text-base">Ngôn ngữ giao diện hiện tại:</Text>
          <Text className="text-sm text-ui-fg-muted">
            Chọn ngôn ngữ để hiển thị trên toàn bộ bảng điều khiển Medusa Admin.
          </Text>
        </div>
        <div className="flex items-center gap-3">
          <Select value={currentLang} onValueChange={handleLangChange}>
            <Select.Trigger className="w-56">
              <Select.Value placeholder="Chọn ngôn ngữ" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="vi">🇻🇳 Tiếng Việt (Vietnamese)</Select.Item>
              <Select.Item value="en">🇬🇧 English (Tiếng Anh)</Select.Item>
              {Object.keys(customLangs).map((code) => (
                <Select.Item key={code} value={code}>
                  🌐 {customLangs[code].name} ({code.toUpperCase()})
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
          <Badge color={currentLang === "vi" ? "green" : currentLang === "en" ? "blue" : "purple"}>
            {currentLang.toUpperCase()} ACTIVE
          </Badge>
        </div>
      </div>

      {/* Translations Table */}
      <div className="border rounded-lg overflow-hidden bg-ui-bg-base">
        <div className="p-4 border-b flex items-center justify-between bg-ui-bg-subtle">
          <Heading level="h2" className="text-base font-semibold">
            Danh Sách Từ Khóa Bản Dịch ({filteredTranslations.length} keys)
          </Heading>
          <input
            type="text"
            placeholder="Tìm kiếm từ khóa..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-1.5 border rounded-md text-sm w-64 outline-none focus:border-ui-border-interactive"
          />
        </div>

        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b bg-ui-bg-subtle text-ui-fg-subtle font-medium">
              <th className="p-3">Khóa (Key)</th>
              <th className="p-3">🇻🇳 Tiếng Việt</th>
              <th className="p-3">🇬🇧 English</th>
              <th className="p-3">🌐 Ngôn ngữ tùy chỉnh ({currentLang.toUpperCase()})</th>
            </tr>
          </thead>
          <tbody>
            {filteredTranslations.map((item, idx) => {
              const activeDict = customLangs[currentLang]?.dict
              const customVal = activeDict ? activeDict[item.key] : undefined

              return (
                <tr key={item.key} className={idx % 2 === 0 ? "bg-ui-bg-base" : "bg-ui-bg-subtle/50"}>
                  <td className="p-3 font-mono text-xs text-ui-fg-subtle">{item.key}</td>
                  <td className="p-3 font-medium">{item.vi}</td>
                  <td className="p-3 text-ui-fg-muted">{item.en}</td>
                  <td className="p-3">
                    {customVal ? (
                      <span className="text-ui-fg-interactive font-medium">{customVal}</span>
                    ) : (
                      <span className="text-ui-fg-muted italic">Mặc định</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Drawer for CSV Import */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <Drawer.Content className="max-w-lg">
          <Drawer.Header>
            <Drawer.Title>📥 Nhập Ngôn Ngữ Mới bằng File CSV</Drawer.Title>
            <Drawer.Description>
              Tải lên hoặc dán các cặp từ khóa (key,translation) để thêm ngôn ngữ mới vào Medusa Admin.
            </Drawer.Description>
          </Drawer.Header>
          <Drawer.Body>
            <form onSubmit={handleImportCSV} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Mã ngôn ngữ (ví dụ: ja, fr, zh, es, ko):</label>
                <input
                  type="text"
                  placeholder="ja"
                  value={langCode}
                  onChange={(e) => setLangCode(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Tên hiển thị (ví dụ: Japanese - 日本語):</label>
                <input
                  type="text"
                  placeholder="Japanese (日本語)"
                  value={langName}
                  onChange={(e) => setLangName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Nội dung CSV (key,translation):</label>
                <textarea
                  rows={8}
                  placeholder={`key,translation\nnav_products,Sản phẩm / Products\nbtn_save,Save Now\n...`}
                  value={csvContent}
                  onChange={(e) => setCsvContent(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm font-mono outline-none"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="secondary" type="button" onClick={() => setDrawerOpen(false)}>
                  Hủy bỏ
                </Button>
                <Button variant="primary" type="submit">
                  Nhập & Áp Dụng Ngôn Ngữ
                </Button>
              </div>
            </form>
          </Drawer.Body>
        </Drawer.Content>
      </Drawer>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Quản lý Ngôn ngữ (i18n)",
  icon: SquaresPlus,
})

export default MedusaLanguagesPage
