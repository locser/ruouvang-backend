import { NHAN_DON_CHATBOT, nhanKenh, nhanThanhToan } from "../nhan-don"

describe("nhanKenh", () => {
  it("ưu tiên khoá kenh_dat_hang", () => {
    expect(nhanKenh({ kenh_dat_hang: "chatbot", phuong_thuc_thanh_toan: "chuyen-khoan" })).toBe("Chatbot")
    expect(nhanKenh({ kenh_dat_hang: "website" })).toBe("Website")
  })
  it("đơn cũ không có kenh_dat_hang: suy từ phuong_thuc_thanh_toan", () => {
    expect(nhanKenh({ phuong_thuc_thanh_toan: "cod" })).toBe("Website")
    expect(nhanKenh({})).toBe("Chatbot")
    expect(nhanKenh(null)).toBe("Chatbot")
    expect(nhanKenh(undefined)).toBe("Chatbot")
  })
  it("đơn chatbot mới KHÔNG bị gắn nhầm là Website dù có phuong_thuc_thanh_toan", () => {
    expect(nhanKenh({ ...NHAN_DON_CHATBOT })).toBe("Chatbot")
  })
})

describe("nhanThanhToan", () => {
  it("chờ chuyển khoản / COD / đã thanh toán", () => {
    expect(nhanThanhToan({ ...NHAN_DON_CHATBOT })).toMatch(/chờ xác nhận tiền/)
    expect(nhanThanhToan({ phuong_thuc_thanh_toan: "cod" })).toMatch(/COD/)
    expect(nhanThanhToan({ phuong_thuc_thanh_toan: "chuyen-khoan", thanh_toan_trang_thai: "da_thanh_toan" })).toMatch(/Đã nhận tiền/)
    expect(nhanThanhToan(undefined)).toMatch(/chờ xác nhận tiền/)
    expect(nhanThanhToan({ phuong_thuc_thanh_toan: "chuyen-khoan", thanh_toan_trang_thai: "can_hoan_thu_cong" })).toBe("⚠️ Cần chuyển trả tiền cho khách")
  })
})
