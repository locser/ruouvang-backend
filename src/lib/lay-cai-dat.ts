import { APP_SETTINGS_MODULE } from "../modules/app-settings"
import { docCache, docCacheCu, ghiCache, xoaCache } from "../modules/app-settings/cache"

/**
 * Đọc cài đặt cửa hàng THẲNG từ module `app_settings` (DB của Medusa), không qua HTTP.
 * Cache 30 giây trong bộ nhớ (service xoá cache khi ghi). Lỗi DB: trả bản cache cũ nếu
 * có, không thì object rỗng. Không bao giờ ném lỗi.
 *
 * ⚠️ Kết quả gồm cả smtp_pass đã giải mã: chỉ dùng trong backend, KHÔNG trả ra API.
 */
export interface CaiDat {
  hotline?: string
  zalo_phone?: string
  bank_name?: string
  bank_account?: string
  bank_account_name?: string
  bank_bin?: string
  shipping_provider?: string
  default_customer_email?: string
  smtp_host?: string
  smtp_port?: string
  smtp_user?: string
  smtp_pass?: string
  smtp_from?: string
}

/** Container/`req.scope` của Medusa: chỉ cần `resolve`. */
export interface PhamViResolve {
  resolve: (ten: string) => any
}

export function xoaCacheCaiDat(): void {
  xoaCache()
}

export async function layCaiDat(scope: PhamViResolve): Promise<CaiDat> {
  const trongCache = docCache()
  if (trongCache) return trongCache as CaiDat
  try {
    const service = scope.resolve(APP_SETTINGS_MODULE)
    const gia_tri = (await service.layNhieu()) as Record<string, string>
    ghiCache(gia_tri)
    return gia_tri as CaiDat
  } catch (e: any) {
    console.warn(`[app-settings] đọc cài đặt lỗi: ${e?.message ?? e}`)
    return (docCacheCu() as CaiDat | null) ?? {}
  }
}
