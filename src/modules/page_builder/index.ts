import { Module } from "@medusajs/framework/utils"
import PageBuilderModuleService from "./service"

/**
 * ⚠️ Tên module chỉ được chứa chữ, số và gạch dưới.
 *    "page_builder" hợp lệ · "page-builder" KHÔNG hợp lệ.
 */
export const PAGE_BUILDER_MODULE = "page_builder"

export default Module(PAGE_BUILDER_MODULE, {
  service: PageBuilderModuleService,
})
