/**
 * Lỗi nghiệp vụ của module cài đặt. `ma` giúp tầng API chọn mã HTTP đúng:
 *  - khong_hop_le / khoa_la: dữ liệu gửi lên sai (400)
 *  - thieu_khoa_ma_hoa: máy chủ chưa cấu hình CONFIG_ENCRYPTION_KEY_MEDUSA (500)
 */
export type MaLoiCaiDat = "khong_hop_le" | "khoa_la" | "thieu_khoa_ma_hoa"

export class LoiCaiDat extends Error {
  constructor(public readonly ma: MaLoiCaiDat, message: string) {
    super(message)
    this.name = "LoiCaiDat"
  }
}
