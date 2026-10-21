import { MedusaError } from "@medusajs/framework/utils"
import { LoiCaiDat } from "../../../modules/app-settings/loi"

/** Đổi LoiCaiDat của module thành MedusaError để Medusa trả đúng mã HTTP. */
export function doiLoi(e: unknown): unknown {
  if (e instanceof LoiCaiDat) {
    return new MedusaError(
      e.ma === "thieu_khoa_ma_hoa"
        ? MedusaError.Types.UNEXPECTED_STATE
        : MedusaError.Types.INVALID_DATA,
      e.message
    )
  }
  return e
}
