/**
 * Dịch thông điệp lỗi của Medusa sang tiếng Việt.
 *
 * Tách riêng khỏi phần gọi mạng để kiểm thử được: đây là hàm thuần tuý, không
 * chạm vào fetch, cookie hay biến môi trường.
 *
 * ⚠️ Nguyên tắc: KHÔNG bao giờ ghép nguyên văn thông điệp của Medusa vào giao
 * diện. Thông điệp gốc là tiếng Anh, đôi khi lộ chi tiết kỹ thuật (tên bảng,
 * tên trường), và với lỗi đăng nhập thì còn có thể tiết lộ email nào đã tồn
 * tại trong hệ thống. Trường hợp không nhận diện được thì trả câu chung.
 */

export function dichLoi(trangThai: number, thongDiep: string): string {
  const t = (thongDiep || "").toLowerCase()

  if (t.includes("already exists") || t.includes("already authenticated")) {
    return "Email này đã được đăng ký. Anh/chị vui lòng đăng nhập."
  }
  if (trangThai === 401 || t.includes("invalid") || t.includes("unauthorized")) {
    return "Email hoặc mật khẩu chưa đúng."
  }
  if (t.includes("password")) {
    return "Mật khẩu chưa hợp lệ — cần tối thiểu 8 ký tự."
  }
  if (trangThai === 429) {
    return "Thao tác quá nhanh, anh/chị thử lại sau ít phút giúp em."
  }
  return "Hệ thống đang bận, anh/chị vui lòng thử lại."
}
