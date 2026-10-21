import { MedusaService } from "@medusajs/framework/utils"
import NhatKyEntry from "./models/nhat-ky-entry"

/**
 * Dịch vụ nhật ký. MedusaService sinh sẵn: createNhatKyEntries,
 * listNhatKyEntries, listAndCountNhatKyEntries, ...
 * Chỉ thêm và đọc, không sửa hay xóa nhật ký.
 */
class NhatKyModuleService extends MedusaService({ NhatKyEntry }) {}

export default NhatKyModuleService
