import { layCaiDat, xoaCacheCaiDat } from "../lay-cai-dat"
import { CACHE_TTL_MS, docCache, ghiCache } from "../../modules/app-settings/cache"
import { anhXaEnvSangCaiDat, phanTichEnv } from "../nap-cai-dat"

const taoScope = (layNhieu: jest.Mock) => ({ resolve: jest.fn(() => ({ layNhieu })) })

describe("layCaiDat (đọc thẳng module)", () => {
  beforeEach(() => {
    xoaCacheCaiDat()
    jest.spyOn(console, "warn").mockImplementation(() => undefined)
  })
  afterEach(() => jest.restoreAllMocks())

  it("resolve module app_settings và trả giá trị", async () => {
    const layNhieu = jest.fn().mockResolvedValue({ hotline: "1900", shipping_provider: "ghn" })
    const scope = taoScope(layNhieu)
    expect(await layCaiDat(scope)).toEqual({ hotline: "1900", shipping_provider: "ghn" })
    expect(scope.resolve).toHaveBeenCalledWith("app_settings")
  })

  it("cache: lần hai không gọi lại; xoá cache thì gọi lại", async () => {
    const layNhieu = jest.fn().mockResolvedValue({ hotline: "1900" })
    const scope = taoScope(layNhieu)
    await layCaiDat(scope)
    await layCaiDat(scope)
    expect(layNhieu).toHaveBeenCalledTimes(1)
    xoaCacheCaiDat()
    await layCaiDat(scope)
    expect(layNhieu).toHaveBeenCalledTimes(2)
  })

  it("cache hết hạn sau 30 giây", () => {
    ghiCache({ hotline: "x" }, 1000)
    expect(docCache(1000 + CACHE_TTL_MS - 1)).not.toBeNull()
    expect(docCache(1000 + CACHE_TTL_MS)).toBeNull()
  })

  it("lỗi và chưa có cache: trả object rỗng, không ném", async () => {
    const scope = taoScope(jest.fn().mockRejectedValue(new Error("db sập")))
    expect(await layCaiDat(scope)).toEqual({})
  })

  it("lỗi khi cache đã hết hạn: trả bản cache cũ", async () => {
    ghiCache({ hotline: "cu" }, Date.now() - CACHE_TTL_MS - 5000)
    const scope = taoScope(jest.fn().mockRejectedValue(new Error("db sập")))
    expect(await layCaiDat(scope)).toEqual({ hotline: "cu" })
  })

  it("resolve ném lỗi (module chưa đăng ký): vẫn không ném", async () => {
    const scope = {
      resolve: () => {
        throw new Error("không có module")
      },
    }
    expect(await layCaiDat(scope)).toEqual({})
  })
})

describe("nạp cài đặt từ .env", () => {
  const ENV = [
    "# chú thích",
    "SMTP_HOST=smtp.gmail.com",
    "SMTP_PORT=587",
    "SMTP_USER=shop@x.com",
    'SMTP_PASS="mat khau ung dung"',
    "SMTP_FROM=",
    "NEXT_PUBLIC_HOTLINE=1900 1234 # ghi chú",
    "NEXT_PUBLIC_ZALO_PHONE=REPLACE_WITH_ZALO",
    "MEDUSA_BANK_NAME=mock_bank",
    "MEDUSA_BANK_ACCOUNT=0123456789",
    "MEDUSA_BANK_ACCOUNT_NAME=chua-dung-den",
    "MEDUSA_BANK_BIN=sai bin!",
    "SHIPPING_PROVIDER=ghtk",
  ].join("\r\n")

  it("ánh xạ đúng, bỏ rỗng/giả/không hợp lệ", () => {
    const kq = anhXaEnvSangCaiDat(phanTichEnv(ENV))
    expect(kq.nap).toEqual({
      smtp_host: "smtp.gmail.com",
      smtp_port: "587",
      smtp_user: "shop@x.com",
      smtp_pass: "mat khau ung dung",
      hotline: "1900 1234",
      bank_account: "0123456789",
      shipping_provider: "ghtk",
    })
    const lyDo = Object.fromEntries(kq.bo_qua.map((b) => [b.env, b.ly_do]))
    expect(lyDo.SMTP_FROM).toMatch(/rỗng/)
    expect(lyDo.NEXT_PUBLIC_ZALO_PHONE).toMatch(/giả/)
    expect(lyDo.MEDUSA_BANK_NAME).toMatch(/giả/)
    expect(lyDo.MEDUSA_BANK_ACCOUNT_NAME).toMatch(/giả/)
    expect(lyDo.MEDUSA_BANK_BIN).toMatch(/không hợp lệ/)
    expect(JSON.stringify(kq.bo_qua)).not.toContain("sai bin")
  })
})
