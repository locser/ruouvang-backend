import { MedusaService } from "@medusajs/framework/utils"
import KhachTiemNang from "./models/khach-tiem-nang"

/** MedusaService sinh sẵn: createKhachTiemNangs, listKhachTiemNangs, updateKhachTiemNangs, ... */
class KhachTiemNangModuleService extends MedusaService({ KhachTiemNang }) {}

export default KhachTiemNangModuleService
