import { Module } from "@medusajs/framework/utils"
import BlogModuleService from "./service"

/**
 * ⚠️ Tên module chỉ chứa chữ, số và gạch dưới. "blog" hợp lệ.
 */
export const BLOG_MODULE = "blog"

export default Module(BLOG_MODULE, {
  service: BlogModuleService,
})
