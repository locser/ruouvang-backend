import Medusa from "@medusajs/js-sdk"

/**
 * SDK dùng trong Admin.
 *
 * auth type "session" = dùng cookie phiên đăng nhập admin sẵn có,
 * không phải tự gắn token.
 *
 * ⚠️ __BACKEND_URL__ do Vite của Medusa Admin bơm vào lúc build.
 *    Nếu TypeScript báo lỗi không biết biến này → khai báo trong
 *    src/admin/vite-env.d.ts.
 */
export const sdk = new Medusa({
  baseUrl: __BACKEND_URL__ || "/",
  debug: import.meta.env.DEV,
  auth: {
    type: "session",
  },
})
