import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { DANH_SACH_KHOA, KHOA_CAI_DAT, type DinhNghiaKhoa } from "../../../../modules/app-settings/khoa"

/** GET /admin/app-settings/schema: danh sách khoá được hỗ trợ kèm mô tả, nhóm, mặc định. */
export const GET = async (_req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const schema = DANH_SACH_KHOA.map((key) => {
    const { kiem_tra: _bo, ...dn } = KHOA_CAI_DAT[key] as DinhNghiaKhoa
    return { key, ...dn }
  })
  res.json({ schema })
}
