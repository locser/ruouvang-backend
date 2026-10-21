import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { APP_SETTINGS_MODULE } from "../../../modules/app-settings"
import type AppSettingsModuleService from "../../../modules/app-settings/service"
import type { PutAdminAppSettingsType } from "./validators"
import { doiLoi } from "./loi"

/** GET /admin/app-settings: liệt kê mọi khoá (bí mật được che). */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const service: AppSettingsModuleService = req.scope.resolve(APP_SETTINGS_MODULE)
  const settings = await service.lietKe({ che: true })
  res.json({ settings })
}

/**
 * PUT /admin/app-settings  body { settings: { khoa: giaTri } }
 * Kiểm hết trước, một khoá sai thì không ghi khoá nào. Giá trị rỗng = xoá khoá.
 */
export const PUT = async (
  req: AuthenticatedMedusaRequest<PutAdminAppSettingsType>,
  res: MedusaResponse
) => {
  const service: AppSettingsModuleService = req.scope.resolve(APP_SETTINGS_MODULE)
  const nguoiSua = (req as any).auth_context?.actor_id ?? null
  try {
    const kq = await service.datNhieu(req.validatedBody.settings, nguoiSua)
    res.json({ ...kq, settings: await service.lietKe({ che: true }) })
  } catch (e) {
    throw doiLoi(e)
  }
}
