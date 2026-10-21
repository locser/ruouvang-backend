import { Module } from "@medusajs/framework/utils"
import AppSettingsModuleService from "./service"

/** Tên module chỉ chứa chữ, số và gạch dưới. */
export const APP_SETTINGS_MODULE = "app_settings"

export default Module(APP_SETTINGS_MODULE, {
  service: AppSettingsModuleService,
})
