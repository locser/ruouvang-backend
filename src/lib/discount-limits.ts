/**
 * Biên độ mã giảm giá do AI tạo, chặn ở server (không tin tầng chatbot).
 * TODO: đưa vào app_settings để chủ shop tự chỉnh.
 */
export const DISCOUNT_LIMITS = {
  /** Giảm theo %: số nguyên 1..30. */
  percentMin: 1,
  percentMax: 30,
  /** Giảm số tiền cố định (VND): số nguyên 1.000..500.000. */
  amountMinVnd: 1_000,
  amountMaxVnd: 500_000,
} as const;
