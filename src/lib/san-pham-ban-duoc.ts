/**
 * Quy tắc catalog dùng chung cho seed C.W. Wines.
 *
 * Bản sao từ `ruouvang-storefront/src/lib/san-pham-ban-duoc.ts` để seed chạy được
 * trong image backend: image chỉ build từ thư mục `ruouvang-backend`, không chứa
 * repo storefront, nên không thể `require` xuyên repo như trước.
 *
 * Nếu sửa quy tắc AUD → VND / điều kiện bán được, sửa CẢ HAI nơi (backend + storefront).
 */

export const TY_GIA_AUD_VND = 17_500;

export interface BienTheCoGia {
  priceAud?: unknown;
  price?: unknown;
}

export interface SanPhamCoGia extends BienTheCoGia {
  priceVnd?: unknown;
  price_vnd?: unknown;
  gia?: unknown;
  variants?: BienTheCoGia[];
}

function laGiaDuong(gia: unknown): boolean {
  const so = typeof gia === "number" ? gia : Number(gia);
  return Number.isFinite(so) && so > 0;
}

/** Biến thể giá 0 không được nạp vào catalog bán hàng. */
export function bienTheBanDuoc(bienThe: BienTheCoGia): boolean {
  return laGiaDuong(bienThe.priceAud ?? bienThe.price);
}

/**
 * Sản phẩm bán được khi có ít nhất một biến thể mang giá dương; bản ghi phẳng
 * của storefront/Meilisearch được xét bằng giá VND đã quy đổi.
 */
export function sanPhamBanDuoc(sanPham: SanPhamCoGia): boolean {
  if (Array.isArray(sanPham.variants) && sanPham.variants.length > 0) {
    return sanPham.variants.some(bienTheBanDuoc);
  }
  return [sanPham.priceVnd, sanPham.price_vnd, sanPham.gia, sanPham.price].some(
    laGiaDuong
  );
}

/** AUD → VND zero-decimal, làm tròn lên bội 1.000 đồng. */
export function audSangVnd(giaAud: unknown): number {
  const aud = typeof giaAud === "number" ? giaAud : Number(giaAud);
  if (!Number.isFinite(aud) || aud <= 0) return 0;
  return Math.ceil((aud * TY_GIA_AUD_VND) / 1000) * 1000;
}
