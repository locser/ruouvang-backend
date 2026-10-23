export type ReportPeriod = "today" | "this_week" | "this_month";

export const REPORT_PERIODS: readonly string[] = ["today", "this_week", "this_month"];

const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Ho_Chi_Minh = UTC+7, không đổi giờ mùa hè

/**
 * Khoảng thời gian tính từ 0h giờ Việt Nam đến `now`.
 * Tuần bắt đầu thứ Hai; tháng bắt đầu ngày 1.
 */
export function periodRange(period: ReportPeriod, now: Date = new Date()): { from: string; to: string } {
  // Dịch sang "giờ Việt Nam giả lập trong UTC" để dùng getUTC* như lịch địa phương.
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  let y = vn.getUTCFullYear();
  let m = vn.getUTCMonth();
  let d = vn.getUTCDate();
  if (period === "this_month") {
    d = 1;
  } else if (period === "this_week") {
    const sinceMonday = (vn.getUTCDay() + 6) % 7; // Chủ nhật(0) -> 6, Thứ Hai(1) -> 0
    const monday = new Date(Date.UTC(y, m, d - sinceMonday));
    y = monday.getUTCFullYear();
    m = monday.getUTCMonth();
    d = monday.getUTCDate();
  }
  const fromMs = Date.UTC(y, m, d) - VN_OFFSET_MS;
  return { from: new Date(fromMs).toISOString(), to: now.toISOString() };
}

/** Ngày YYYY-MM-DD theo giờ Việt Nam. */
export function vnDateString(now: Date = new Date()): string {
  return new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}
