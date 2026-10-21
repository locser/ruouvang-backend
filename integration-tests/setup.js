/**
 * Tệp khởi tạo cho Jest — chạy TRƯỚC mỗi tệp kiểm thử.
 *
 * `jest.config.js` đã trỏ tới tệp này từ đầu (kế thừa từ khung mẫu Medusa),
 * nhưng tệp chưa từng được tạo — nên mọi lệnh `test:unit` / `test:integration:*`
 * đều hỏng ngay ở bước nạp cấu hình. Đây chính là lý do `apps/backend` không có
 * lấy một bài kiểm thử nào: khung có sẵn nhưng không chạy được.
 *
 * Việc duy nhất cần làm ở đây: xoá kho siêu dữ liệu của MikroORM giữa các tệp
 * kiểm thử. Không xoá thì tệp thứ hai trở đi sẽ báo trùng thực thể ("Entity X
 * is already registered") vì mỗi tệp nạp lại các module của Medusa.
 *
 * Bọc trong try/catch có chủ ý: bài kiểm thử đơn vị thuần tuý không cần tới MikroORM, và không được để một phụ thuộc
 * không liên quan làm hỏng cả bộ kiểm thử.
 */

try {
  const { MetadataStorage } = require("@mikro-orm/core")
  MetadataStorage.clear()
} catch (loi) {
  // Không nạp được MikroORM thì bỏ qua — chỉ ảnh hưởng kiểm thử tích hợp.
  if (process.env.DEBUG_TEST_SETUP) {
    console.warn("[setup.js] Bỏ qua MetadataStorage.clear():", loi.message)
  }
}
