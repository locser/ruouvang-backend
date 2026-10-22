import { Module } from "@medusajs/framework/utils"
import KhachTiemNangModuleService from "./service"

/** Tên module chỉ chứa chữ, số và gạch dưới. */
export const KHACH_TIEM_NANG_MODULE = "khach_tiem_nang_module"

export default Module(KHACH_TIEM_NANG_MODULE, {
  service: KhachTiemNangModuleService,
})
