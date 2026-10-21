/**
 * Cache trong bộ nhớ 30 giây cho cài đặt đã giải mã. Một ô duy nhất vì mỗi
 * instance Medusa chỉ phục vụ một cửa hàng. Service xoá cache mỗi lần ghi (chỉ
 * ảnh hưởng instance đang xử lý; instance khác thấy giá trị mới sau tối đa 30s).
 */
export const CACHE_TTL_MS = 30_000

let o: { luc: number; gia_tri: Record<string, string> } | null = null

export function docCache(bay_gio = Date.now()): Record<string, string> | null {
  return o && bay_gio - o.luc < CACHE_TTL_MS ? o.gia_tri : null
}

/** Bản cũ, kể cả đã hết hạn - dùng khi đọc DB lỗi. */
export function docCacheCu(): Record<string, string> | null {
  return o ? o.gia_tri : null
}

export function ghiCache(gia_tri: Record<string, string>, bay_gio = Date.now()): void {
  o = { luc: bay_gio, gia_tri }
}

export function xoaCache(): void {
  o = null
}
