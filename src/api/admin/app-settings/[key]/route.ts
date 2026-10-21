import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { APP_SETTINGS_MODULE } from "../../../../modules/app-settings"
import type AppSettingsModuleService from "../../../../modules/app-settings/service"
import type { PutAdminAppSettingType } from "../validators"
import { doiLoi } from "../loi"

/** PUT /admin/app-settings/:key  body { value }  (value rỗng = xoá khoá) */
export const PUT = async (
  req: AuthenticatedMedusaRequest<PutAdminAppSettingType>,
  res: MedusaResponse
) => {
  const service: AppSettingsModuleService = req.scope.resolve(APP_SETTINGS_MODULE)
  const nguoiSua = (req as any).auth_context?.actor_id ?? null
  try {
    await service.datGiaTri(req.params.key, req.validatedBody.value, nguoiSua)
    const muc = (await service.lietKe({ che: true })).find((m) => m.key === req.params.key)
    res.json({ setting: muc })
  } catch (e) {
    throw doiLoi(e)
  }
}

/** DELETE /admin/app-settings/:key  (quay về giá trị mặc định) */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const service: AppSettingsModuleService = req.scope.resolve(APP_SETTINGS_MODULE)
  try {
    await service.xoaGiaTri(req.params.key)
  } catch (e) {
    throw doiLoi(e)
  }
  res.json({ key: req.params.key, deleted: true })
}
