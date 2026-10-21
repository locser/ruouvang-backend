import { MedusaService } from "@medusajs/framework/utils"
import PageTemplate from "./models/page-template"
import PageSection from "./models/page-section"
import { buildDefaultSettings, getSectionSchema } from "./section-schemas"

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  DỊCH VỤ PAGE BUILDER
 * ═══════════════════════════════════════════════════════════════════════
 *  MedusaService tự sinh sẵn (theo KHOÁ trong object bên dưới):
 *    listPageTemplates · listAndCountPageTemplates · retrievePageTemplate
 *    createPageTemplates · updatePageTemplates · deletePageTemplates
 *    listPageSections · retrievePageSection · createPageSections
 *    updatePageSections · deletePageSections   (+ softDelete/restore)
 *
 *  ⚠️ RÀNG BUỘC BẮT BUỘC (tài liệu Medusa — service-constraints):
 *   • Mọi method PHẢI async — Medusa luôn gọi kèm await.
 *   • Có constructor thì PHẢI gọi super(...arguments).
 * ═══════════════════════════════════════════════════════════════════════
 */
class PageBuilderModuleService extends MedusaService({
  PageTemplate,
  PageSection,
}) {
  /**
   * Lấy trang kèm các khối ĐANG BẬT, đã sắp thứ tự — dùng cho storefront.
   * Trả null nếu không có hoặc chưa publish (đừng ném lỗi ở tầng service,
   * để tầng API quyết định trả 404 hay trang rỗng).
   */
  async getPublishedPage(handle: string) {
    const [template] = await this.listPageTemplates({
      handle,
      status: "published",
    })

    if (!template) return null

    const sections = await this.listPageSections({
      template_id: template.id,
      enabled: true,
    })

    return {
      ...template,
      sections: this.sortByPosition(sections),
    }
  }

  /**
   * Lấy trang kèm TẤT CẢ khối (cả khối đang tắt) — dùng cho Admin.
   */
  async getPageForAdmin(templateId: string) {
    const template = await this.retrievePageTemplate(templateId)
    const sections = await this.listPageSections({ template_id: templateId })

    return {
      ...template,
      sections: this.sortByPosition(sections),
    }
  }

  /**
   * Thêm khối mới vào cuối trang, settings lấy mặc định từ lược đồ.
   *
   * Trả về { error } thay vì ném lỗi khi:
   *  - type không có trong lược đồ
   *  - khối đã chạm giới hạn số lần dùng (limit) trên trang đó
   */
  async addSection(templateId: string, type: string) {
    const schema = getSectionSchema(type)
    if (!schema) {
      return { error: `Không có loại khối "${type}" trong lược đồ.` }
    }

    const existing = await this.listPageSections({ template_id: templateId })

    if (schema.limit != null) {
      const used = existing.filter((s: any) => s.type === type).length
      if (used >= schema.limit) {
        return {
          error: `Khối "${schema.name}" chỉ được dùng tối đa ${schema.limit} lần trên một trang.`,
        }
      }
    }

    // Cách quãng 10 để sau này chèn giữa không phải đánh số lại toàn bộ
    const maxPos = existing.reduce(
      (m: number, s: any) => (s.position > m ? s.position : m),
      -10
    )

    const [created] = await this.createPageSections([
      {
        template_id: templateId,
        type,
        position: maxPos + 10,
        enabled: true,
        settings: buildDefaultSettings(type),
      },
    ])

    return { section: created }
  }

  /**
   * Sắp xếp lại thứ tự khối theo danh sách id truyền vào.
   * Đánh số lại 0,10,20… để luôn còn chỗ chèn giữa.
   */
  async reorderSections(templateId: string, orderedIds: string[]) {
    const sections = await this.listPageSections({ template_id: templateId })
    const known = new Set(sections.map((s: any) => s.id))

    const unknown = orderedIds.filter((id) => !known.has(id))
    if (unknown.length) {
      return { error: `Không thuộc trang này: ${unknown.join(", ")}` }
    }
    if (orderedIds.length !== sections.length) {
      return {
        error: `Danh sách sắp xếp có ${orderedIds.length} khối nhưng trang đang có ${sections.length}. Phải gửi đủ.`,
      }
    }

    await this.updatePageSections(
      orderedIds.map((id, i) => ({ id, position: i * 10 }))
    )

    return { ok: true }
  }

  /** Bật/tắt một khối — không xoá dữ liệu. */
  async toggleSection(id: string, enabled: boolean) {
    await this.updatePageSections([{ id, enabled }])
    return this.retrievePageSection(id)
  }

  /**
   * Ghi settings của khối.
   *
   * ⚠️ LUÔN ghi TRỌN VẸN object, không ghi từng phần. Lý do (tài liệu
   *    Medusa — JSON properties): json() MERGE chứ không thay thế, và
   *    chuỗi rỗng "" sẽ XOÁ HẲN khoá. Tầng validator đã đổi "" → null.
   */
  async setSectionSettings(id: string, settings: Record<string, unknown>) {
    await this.updatePageSections([{ id, settings }])
    return this.retrievePageSection(id)
  }

  /** Sắp theo position, position bằng nhau thì theo id cho ổn định. */
  private sortByPosition(sections: any[]) {
    return [...sections].sort(
      (a, b) => a.position - b.position || String(a.id).localeCompare(String(b.id))
    )
  }
}

export default PageBuilderModuleService
