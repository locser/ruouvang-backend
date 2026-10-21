import { cheBiMat, giaiMa, maHoa } from "../ma-hoa"
import { DANH_SACH_KHOA, KHOA_CONG_KHAI, baoDamKhoaHopLe, kiemTraGiaTri } from "../khoa"
import { LoiCaiDat } from "../loi"
import AppSettingsModuleService from "../service"
import { docCache, xoaCache, ghiCache } from "../cache"

const KHOA = "khoa-thu-nghiem-1"

describe("mã hoá AES-256-GCM", () => {
  it("mã hoá rồi giải mã ra đúng bản rõ, định dạng iv:tag:cipher", () => {
    const x = maHoa("mat-khau-ung-dung", KHOA)
    expect(x.split(":")).toHaveLength(3)
    expect(x).not.toContain("mat-khau")
    expect(giaiMa(x, KHOA)).toBe("mat-khau-ung-dung")
  })
  it("mỗi lần mã hoá ra chuỗi khác nhau (iv ngẫu nhiên)", () => {
    expect(maHoa("a", KHOA)).not.toBe(maHoa("a", KHOA))
  })
  it("sai khoá: trả rỗng, cảnh báo, không ném", () => {
    const canhBao = jest.fn()
    expect(giaiMa(maHoa("bi-mat", KHOA), "khoa-khac", canhBao)).toBe("")
    expect(canhBao).toHaveBeenCalledTimes(1)
  })
  it("dữ liệu hỏng/sai định dạng: trả rỗng", () => {
    const canhBao = jest.fn()
    expect(giaiMa("khong-phai-dinh-dang", KHOA, canhBao)).toBe("")
    expect(giaiMa("00:11:22", KHOA, canhBao)).toBe("")
    expect(canhBao).toHaveBeenCalledTimes(2)
  })
  it("thiếu CONFIG_ENCRYPTION_KEY_MEDUSA khi mã hoá: ném lỗi rõ ràng, không lưu thô", () => {
    const cu = process.env.CONFIG_ENCRYPTION_KEY_MEDUSA
    delete process.env.CONFIG_ENCRYPTION_KEY_MEDUSA
    try {
      expect(() => maHoa("x")).toThrow(/CONFIG_ENCRYPTION_KEY_MEDUSA/)
      try {
        maHoa("x")
      } catch (e: any) {
        expect(e).toBeInstanceOf(LoiCaiDat)
        expect(e.ma).toBe("thieu_khoa_ma_hoa")
      }
    } finally {
      if (cu !== undefined) process.env.CONFIG_ENCRYPTION_KEY_MEDUSA = cu
    }
  })
  it("che bí mật: •••• + 4 ký tự cuối", () => {
    expect(cheBiMat("abcdefgh")).toBe("••••efgh")
    expect(cheBiMat("abcd")).toBe("••••")
    expect(cheBiMat("")).toBe("")
  })
})

describe("danh sách khoá và kiểm tra giá trị", () => {
  it("đúng 12 khoá, chỉ 6 khoá công khai", () => {
    expect(DANH_SACH_KHOA).toHaveLength(13)
    expect([...KHOA_CONG_KHAI].sort()).toEqual(
      ["bank_account", "bank_account_name", "bank_bin", "bank_name", "hotline", "zalo_phone"].sort()
    )
  })
  it("từ chối khoá lạ và khoá sai định dạng", () => {
    expect(() => baoDamKhoaHopLe("deepseek_api_key")).toThrow(LoiCaiDat)
    expect(() => baoDamKhoaHopLe("telegram_bot_token")).toThrow(/không được hỗ trợ/)
    expect(() => baoDamKhoaHopLe("Hotline")).toThrow(/không hợp lệ/)
    expect(() => baoDamKhoaHopLe("__proto__")).toThrow(LoiCaiDat)
    expect(() => baoDamKhoaHopLe("hotline")).not.toThrow()
  })
  it("smtp_port 1-65535", () => {
    expect(kiemTraGiaTri("smtp_port", "587")).toEqual({ ok: true, value: "587" })
    for (const v of ["0", "65536", "abc", "5.5", "-1"]) expect(kiemTraGiaTri("smtp_port", v).ok).toBe(false)
  })
  it("bank_account 3-20 chữ số, bank_bin là mã chữ (MB, VCB) hoặc BIN 6 số", () => {
    expect(kiemTraGiaTri("bank_account", "0123456789").ok).toBe(true)
    for (const v of ["12", "1".repeat(21), "12a45"]) expect(kiemTraGiaTri("bank_account", v).ok).toBe(false)
    for (const v of ["970436", "MB", "VCB", "Techcombank"]) expect(kiemTraGiaTri("bank_bin", v).ok).toBe(true)
    for (const v of ["M", "x".repeat(13), "mb bank", "MB-1"]) expect(kiemTraGiaTri("bank_bin", v).ok).toBe(false)
  })
  it("chuỗi, tối đa 255 ký tự, không ký tự điều khiển; cắt khoảng trắng; rỗng hợp lệ", () => {
    expect(kiemTraGiaTri("hotline", 123).ok).toBe(false)
    expect(kiemTraGiaTri("hotline", "x".repeat(256)).ok).toBe(false)
    expect(kiemTraGiaTri("hotline", "x".repeat(255)).ok).toBe(true)
    expect(kiemTraGiaTri("hotline", "09\n12").ok).toBe(false)
    expect(kiemTraGiaTri("hotline", "09\u0000").ok).toBe(false)
    expect(kiemTraGiaTri("hotline", "  1900 1234  ")).toEqual({ ok: true, value: "1900 1234" })
    expect(kiemTraGiaTri("bank_bin", "  ")).toEqual({ ok: true, value: "" })
  })
})

/** Service giả: dựng từ prototype thật, thay các phương thức do MedusaService sinh bằng kho trong bộ nhớ. */
function taoService() {
  const kho: any[] = []
  let dem = 0
  const svc: any = Object.create(AppSettingsModuleService.prototype)
  svc.canhBao = jest.fn()
  svc.listAppSettings = async (loc: any = {}) => kho.filter((d) => !loc.key || d.key === loc.key)
  svc.createAppSettings = async (d: any) => {
    if (kho.some((x) => x.key === d.key)) throw new Error("trùng khoá")
    kho.push({ id: `as_${++dem}`, updated_at: "2026-10-21", ...d })
  }
  svc.updateAppSettings = async (d: any) => Object.assign(kho.find((x) => x.id === d.id), d)
  svc.deleteAppSettings = async (ids: string | string[]) => {
    for (const id of ([] as string[]).concat(ids)) kho.splice(kho.findIndex((x) => x.id === id), 1)
  }
  return { svc: svc as AppSettingsModuleService, kho }
}

describe("AppSettingsModuleService (kho giả)", () => {
  const cu = process.env.CONFIG_ENCRYPTION_KEY_MEDUSA
  beforeEach(() => {
    process.env.CONFIG_ENCRYPTION_KEY_MEDUSA = KHOA
    xoaCache()
  })
  afterAll(() => {
    if (cu === undefined) delete process.env.CONFIG_ENCRYPTION_KEY_MEDUSA
    else process.env.CONFIG_ENCRYPTION_KEY_MEDUSA = cu
  })

  it("layGiaTri: DB, rồi mặc định, rồi rỗng; khoá lạ trả rỗng", async () => {
    const { svc } = taoService()
    expect(await svc.layGiaTri("shipping_provider")).toBe("ghn")
    expect(await svc.layGiaTri("hotline")).toBe("")
    expect(await svc.layGiaTri("khong_co")).toBe("")
    await svc.datGiaTri("shipping_provider", "ghtk", "user_1")
    expect(await svc.layGiaTri("shipping_provider")).toBe("ghtk")
  })

  it("datGiaTri: tạo mới rồi cập nhật cùng bản ghi, ghi updated_by", async () => {
    const { svc, kho } = taoService()
    await svc.datGiaTri("hotline", "1900 1234", "user_1")
    await svc.datGiaTri("hotline", "1900 9999", "user_2")
    expect(kho).toHaveLength(1)
    expect(kho[0]).toMatchObject({ key: "hotline", value: "1900 9999", updated_by: "user_2", is_secret: false })
  })

  it("khoá bí mật được mã hoá trong kho, đọc lại ra bản rõ, liệt kê thì che", async () => {
    const { svc, kho } = taoService()
    await svc.datGiaTri("smtp_pass", "abcd efgh ijkl", "u")
    expect(kho[0].is_secret).toBe(true)
    expect(kho[0].value).not.toContain("abcd")
    expect(kho[0].value.split(":")).toHaveLength(3)
    expect(await svc.layGiaTri("smtp_pass")).toBe("abcd efgh ijkl")
    expect((await svc.layNhieu()).smtp_pass).toBe("abcd efgh ijkl")
    const muc = (await svc.lietKe({ che: true })).find((m) => m.key === "smtp_pass")!
    expect(muc.value).toBe("••••ijkl")
    expect(JSON.stringify(await svc.lietKe())).not.toContain("abcd efgh")
    expect(muc.nguon).toBe("db")
  })

  it("thiếu CONFIG_ENCRYPTION_KEY_MEDUSA: ghi khoá bí mật báo lỗi, không lưu gì", async () => {
    const { svc, kho } = taoService()
    delete process.env.CONFIG_ENCRYPTION_KEY_MEDUSA
    await expect(svc.datGiaTri("smtp_pass", "x")).rejects.toThrow(/CONFIG_ENCRYPTION_KEY_MEDUSA/)
    expect(kho).toHaveLength(0)
  })

  it("sai khoá giải mã: layGiaTri trả rỗng, cảnh báo, không ném; liệt kê vẫn che", async () => {
    const { svc } = taoService()
    await svc.datGiaTri("smtp_pass", "bi-mat-1234")
    process.env.CONFIG_ENCRYPTION_KEY_MEDUSA = "doi-khoa"
    expect(await svc.layGiaTri("smtp_pass")).toBe("")
    expect((svc as any).canhBao).toHaveBeenCalled()
    expect((await svc.lietKe()).find((m) => m.key === "smtp_pass")!.value).toBe("••••")
  })

  it("từ chối khoá lạ; datNhieu: một khoá sai thì KHÔNG ghi khoá nào", async () => {
    const { svc, kho } = taoService()
    await expect(svc.datGiaTri("deepseek_api_key", "x")).rejects.toThrow(LoiCaiDat)
    await expect(svc.datNhieu({ hotline: "1900", bank_bin: "sai bin!" })).rejects.toThrow(/bank_bin/)
    expect(kho).toHaveLength(0)
    await expect(svc.datNhieu({ hotline: "1900", khoa_la: "x" })).rejects.toThrow(/khoa_la/)
    expect(kho).toHaveLength(0)
  })

  it("giá trị rỗng = xoá khoá, quay về mặc định", async () => {
    const { svc, kho } = taoService()
    await svc.datGiaTri("shipping_provider", "ghtk")
    const kq = await svc.datNhieu({ shipping_provider: "", hotline: "1900" })
    expect(kq).toEqual({ da_dat: ["hotline"], da_xoa: ["shipping_provider"] })
    expect(kho.map((d) => d.key)).toEqual(["hotline"])
    expect(await svc.layGiaTri("shipping_provider")).toBe("ghn")
  })

  it("xoaGiaTri: xoá khoá có sẵn, khoá chưa đặt không lỗi, khoá lạ lỗi", async () => {
    const { svc, kho } = taoService()
    await svc.datGiaTri("hotline", "1900")
    await svc.xoaGiaTri("hotline")
    await svc.xoaGiaTri("zalo_phone")
    expect(kho).toHaveLength(0)
    await expect(svc.xoaGiaTri("khong_co")).rejects.toThrow(LoiCaiDat)
  })

  it("lietKe: nguồn db / mac_dinh / chua_dat, có mô tả", async () => {
    const { svc } = taoService()
    await svc.datGiaTri("hotline", "1900")
    const ds = await svc.lietKe()
    const nguon = (k: string) => ds.find((m) => m.key === k)!.nguon
    expect(nguon("hotline")).toBe("db")
    expect(nguon("shipping_provider")).toBe("mac_dinh")
    expect(nguon("zalo_phone")).toBe("chua_dat")
    expect(ds.every((m) => m.mo_ta.length > 0)).toBe(true)
  })

  it("ghi xoá cache", async () => {
    const { svc } = taoService()
    ghiCache({ hotline: "cu" })
    expect(docCache()).not.toBeNull()
    await svc.datGiaTri("hotline", "moi")
    expect(docCache()).toBeNull()
  })
})
