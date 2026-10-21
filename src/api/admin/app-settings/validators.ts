import { z } from "@medusajs/framework/zod"

/**
 * Validators cho /admin/app-settings. Chỉ kiểm cấu trúc; kiểm giá trị từng khoá
 * (khoá lạ, định dạng, độ dài...) do module làm trong service.datNhieu để một nơi duy nhất.
 */
export const PutAdminAppSettings = z.object({
  settings: z.record(z.string(), z.string()),
})
export type PutAdminAppSettingsType = z.infer<typeof PutAdminAppSettings>

export const PutAdminAppSetting = z.object({
  value: z.string(),
})
export type PutAdminAppSettingType = z.infer<typeof PutAdminAppSetting>
