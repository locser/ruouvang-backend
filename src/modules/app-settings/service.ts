import { MedusaService } from "@medusajs/framework/utils"
import AppSetting from "./models/app-setting"
import { cheBiMat, giaiMa, maHoa } from "./ma-hoa"
import {
  DANH_SACH_KHOA,
  baoDamKhoaHopLe,
  dinhNghiaKhoa,
  kiemTraGiaTri,
  type DinhNghiaKhoa,
  type KhoaCaiDat,
} from "./khoa"
import { LoiCaiDat } from "./loi"
import { xoaCache } from "./cache"

export type NguonCaiDat = "db" | "mac_dinh" | "chua_dat"

export interface MucCaiDat {
  key: KhoaCaiDat
  mo_ta: string
  nhom: DinhNghiaKhoa["nhom"]
  bi_mat: boolean
  cong_khai: boolean
  mac_dinh: string
  /** Giá trị hiện dùng (đã che nếu là bí mật và che=true). */
  value: string
  nguon: NguonCaiDat
  updated_at: string | Date | null
  updated_by: string | null
}

/**
 * Dịch vụ cài đặt cửa hàng. MedusaService sinh sẵn (model AppSetting):
 * createAppSettings, listAppSettings, listAndCountAppSettings, retrieveAppSetting,
 * updateAppSettings, deleteAppSettings, softDeleteAppSettings, restoreAppSettings.
 * Ở đây thêm phần có logic: kiểm tra khoá, mã hoá bí mật, giá trị mặc định.
 * Xoá khoá dùng deleteAppSettings (xoá hẳn), nên không tích tụ bản ghi xoá mềm.
 */
class AppSettingsModuleService extends MedusaService({ AppSetting }) {
  protected canhBao(tb: string): void {
    console.warn(tb)
  }

  protected async docBanGhi(): Promise<Map<string, any>> {
    const dong: any[] = await (this as any).listAppSettings({}, { take: 1000 })
    return new Map(dong.map((d) => [d.key, d]))
  }

  protected giaTriBanGhi(key: KhoaCaiDat, d: any | undefined): string {
    const dn = dinhNghiaKhoa(key)!
    if (!d || d.value === "" || d.value == null) return dn.mac_dinh
    return dn.bi_mat ? giaiMa(d.value, undefined, (tb) => this.canhBao(tb)) : d.value
  }

  /** DB, rồi mặc định, rồi "". Khoá lạ trả "" (không ném, để đường đọc không làm hỏng luồng đặt hàng). */
  async layGiaTri(key: string): Promise<string> {
    if (!dinhNghiaKhoa(key)) return ""
    const dong: any[] = await (this as any).listAppSettings({ key }, { take: 1 })
    return this.giaTriBanGhi(key as KhoaCaiDat, dong[0])
  }

  /** Mọi khoá trong danh sách, đã giải mã, đã áp mặc định. */
  async layNhieu(): Promise<Record<string, string>> {
    const map = await this.docBanGhi()
    const out: Record<string, string> = {}
    for (const k of DANH_SACH_KHOA) out[k] = this.giaTriBanGhi(k, map.get(k))
    return out
  }

  /** Giá trị rỗng = xoá khoá. Ném LoiCaiDat nếu khoá lạ, giá trị sai hoặc thiếu khoá mã hoá. */
  async datGiaTri(key: string, value: unknown, nguoiSua?: string | null): Promise<void> {
    await this.datNhieu({ [key]: value }, nguoiSua)
  }

  /**
   * Kiểm tra TOÀN BỘ trước (và mã hoá thử), một khoá sai thì không ghi khoá nào.
   * Lưu ý: các lệnh ghi sau đó chạy lần lượt, không bọc trong một giao dịch DB.
   */
  async datNhieu(
    cai: Record<string, unknown>,
    nguoiSua?: string | null
  ): Promise<{ da_dat: string[]; da_xoa: string[] }> {
    const loi: string[] = []
    const ghi: { key: KhoaCaiDat; value: string; bi_mat: boolean }[] = []
    const xoa: KhoaCaiDat[] = []

    for (const [key, raw] of Object.entries(cai)) {
      try {
        baoDamKhoaHopLe(key)
      } catch (e: any) {
        loi.push(e.message)
        continue
      }
      const kq = kiemTraGiaTri(key, raw)
      if (!kq.ok) {
        loi.push(kq.loi)
        continue
      }
      const dn = dinhNghiaKhoa(key)!
      if (kq.value === "") xoa.push(key)
      else ghi.push({ key, value: dn.bi_mat ? maHoa(kq.value) : kq.value, bi_mat: dn.bi_mat })
    }
    if (loi.length) throw new LoiCaiDat("khong_hop_le", loi.join("; "))

    try {
      if (ghi.length || xoa.length) {
        const hienCo = await this.docBanGhi()
        for (const g of ghi) {
          const cu = hienCo.get(g.key)
          if (cu) {
            await (this as any).updateAppSettings({
              id: cu.id,
              value: g.value,
              is_secret: g.bi_mat,
              updated_by: nguoiSua ?? null,
            })
          } else {
            await (this as any).createAppSettings({
              key: g.key,
              value: g.value,
              is_secret: g.bi_mat,
              updated_by: nguoiSua ?? null,
            })
          }
        }
        const idXoa = xoa.map((k) => hienCo.get(k)?.id).filter(Boolean)
        if (idXoa.length) await (this as any).deleteAppSettings(idXoa)
      }
    } finally {
      xoaCache()
    }
    return { da_dat: ghi.map((g) => g.key), da_xoa: xoa }
  }

  async xoaGiaTri(key: string): Promise<void> {
    baoDamKhoaHopLe(key)
    const dong: any[] = await (this as any).listAppSettings({ key }, { take: 1 })
    try {
      if (dong[0]) await (this as any).deleteAppSettings(dong[0].id)
    } finally {
      xoaCache()
    }
  }

  /** Liệt kê mọi khoá trong danh sách kèm nguồn. che=true (mặc định): bí mật chỉ trả "••••" + 4 ký tự cuối. */
  async lietKe(tuyChon: { che?: boolean } = {}): Promise<MucCaiDat[]> {
    const che = tuyChon.che !== false
    const map = await this.docBanGhi()
    return DANH_SACH_KHOA.map((key) => {
      const dn = dinhNghiaKhoa(key)!
      const d = map.get(key)
      const coDb = !!d && d.value !== "" && d.value != null
      const nguon: NguonCaiDat = coDb ? "db" : dn.mac_dinh !== "" ? "mac_dinh" : "chua_dat"
      let value = this.giaTriBanGhi(key, d)
      if (dn.bi_mat && che) value = value ? cheBiMat(value) : coDb ? "••••" : ""
      return {
        key,
        mo_ta: dn.mo_ta,
        nhom: dn.nhom,
        bi_mat: dn.bi_mat,
        cong_khai: dn.cong_khai,
        mac_dinh: dn.mac_dinh,
        value,
        nguon,
        updated_at: coDb ? d.updated_at ?? null : null,
        updated_by: coDb ? d.updated_by ?? null : null,
      }
    })
  }
}

export default AppSettingsModuleService
