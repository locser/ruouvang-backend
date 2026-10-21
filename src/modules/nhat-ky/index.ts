import { Module } from "@medusajs/framework/utils"
import NhatKyModuleService from "./service"

/** Tên module chỉ chứa chữ, số và gạch dưới. */
export const NHAT_KY_MODULE = "nhat_ky"

export default Module(NHAT_KY_MODULE, {
  service: NhatKyModuleService,
})
