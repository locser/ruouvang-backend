import { loadEnv, defineConfig } from "@medusajs/framework/utils"
import path from "path"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

const CORS_TAT_CA = "/.*/"

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.CONFIG_POSTGRES_URL_MEDUSA,
    databaseDriverOptions: {
      connection: {
        ssl: false,
      },
    },
    redisUrl: process.env.CONFIG_REDIS_URL_MEDUSA,
    http: {
      // CHO PHÉP MỌI ORIGIN, không đọc từ env để không có cấu hình sai nào chặn được.
      // "/.*/" là regex: Medusa (parseCorsOrigins) biến nó thành RegExp, thư viện cors phản hồi
      // lại đúng origin của request nên vẫn dùng được cùng credentials (cookie/JWT).
      storeCors: CORS_TAT_CA,
      adminCors: CORS_TAT_CA,
      authCors: CORS_TAT_CA,
      jwtSecret: process.env.CONFIG_JWT_SECRET_MEDUSA || "",
      cookieSecret: process.env.CONFIG_COOKIE_SECRET_MEDUSA || "",
    },
  },

  admin: {
    backendUrl: process.env.CONFIG_API_MEDUSA_URL,
    vite: (config: any) => {
      console.log("[ViteConfigRoot]:", config.root)
      // Flatten plugins and filter out React Refresh HMR plugins to prevent duplicate code injection in Docker
      if (config.plugins) {
        config.plugins = config.plugins.flat().filter((p: any) => {
          if (p && (p.name === "vite:react-refresh" || p.name === "vite:react-babel" || p.name === "vite:react-swc")) {
            return false
          }
          return true
        })
      }

      config.resolve = config.resolve || {}
      config.resolve.alias = [
        {
          find: /^\/apps\/backend/,
          replacement: "/app/apps/backend"
        }
      ]
      config.server = config.server || {}
      config.server.fs = config.server.fs || {}
      config.server.fs.allow = config.server.fs.allow || []
      config.server.fs.allow.push("/app")
      console.log("[ViteConfigFSAllow]:", config.server.fs.allow)
      config.server.port = Number(process.env.CONFIG_ADMIN_PORT || 5173)
      config.server.host = "0.0.0.0"
      // Kênh cập nhật nóng (HMR) của Vite. Trình duyệt nối tới cổng này; nếu cổng không tới được thì
      // Vite client báo "server connection lost" rồi dò `http://localhost:<cổng>/app/` liên tục, và
      // HỄ có bất kỳ dịch vụ nào trả lời ở cổng đó thì nó TẢI LẠI TRANG — admin quay tròn mãi.
      // Trong Docker, cổng 5173 của container được publish thành 15173 (và Vite ở chế độ middleware
      // không nghe cổng đó) nên HMR không dùng được: đặt CONFIG_ADMIN_HMR_PORT=off để tắt hẳn.
      // Chạy trên máy host (run-local.js) thì bỏ trống = 5173 như cũ.
      const hmrPort = process.env.CONFIG_ADMIN_HMR_PORT
      config.server.hmr = hmrPort === "off" ? false : { clientPort: Number(hmrPort || 5173) }
      // ── Danh sách Host được phép vào trang quản trị ──────────────────────
      //
      // Trang quản trị Medusa do Vite phục vụ, và Vite ĐỐI CHIẾU tiêu đề `Host`
      // của mỗi request với danh sách này. Host lạ thì trả thẳng 403 kèm
      // "Blocked request. This host ... is not allowed" — KHÔNG phải lỗi đăng
      // nhập, không phải lỗi proxy, nên rất dễ đi tìm nhầm chỗ.
      //
      // Trước 07/08/2026 danh sách chỉ có Tailscale + localhost, nên MỌI tên
      // miền `*.polarisvn.holdings` đều nhận 403 — cả bảy shop, kể cả ba shop
      // đã có `admin.` / `cellphones-admin.` / `farmersmarket-admin.` từ lâu.
      // Đó mới là nguyên nhân thật của việc ba tên miền đó "chết", chứ không
      // chỉ vì chúng trỏ nhầm cổng 5173.
      //
      // Dấu chấm đầu (`.polarisvn.holdings`) là cú pháp Vite cho "mọi
      // subdomain của tên miền này" — nhờ vậy thêm shop mới không phải sửa
      // file này nữa.
      config.server.allowedHosts = [
        ".polarisvn.holdings",
        "legion-pro-7.taildc8df5.ts.net",
        "localhost",
        "100.81.31.20",
      ]
      return config
    },
  },

  modules: [
    // ---- Page Builder — landing page động, bật/tắt/sắp xếp khối ----
    {
      resolve: "./src/modules/page_builder",
    },

    // ---- Blog — module bài viết ĐA NGÔN NGỮ ----
    {
      resolve: "./src/modules/blog",
    },

    // ---- Nhật ký đơn hàng và thanh toán — ai làm gì, lúc nào (đối soát) ----
    {
      resolve: "./src/modules/nhat-ky",
    },

    // ---- Cài đặt cửa hàng (hotline, ngân hàng, SMTP...) — bảng app_settings của Medusa ----
    {
      resolve: "./src/modules/app-settings",
    },

    // ---- Đa ngôn ngữ (Translation) ----
    { resolve: "@medusajs/medusa/translation" },

    // ---- Hạ tầng Redis ----
    {
      resolve: "@medusajs/medusa/cache-redis",
      options: { redisUrl: process.env.CONFIG_REDIS_URL_MEDUSA },
    },
    {
      resolve: "@medusajs/medusa/event-bus-redis",
      options: { redisUrl: process.env.CONFIG_REDIS_URL_MEDUSA },
    },
    {
      resolve: "@medusajs/medusa/workflow-engine-redis",
      options: { redis: { url: process.env.CONFIG_REDIS_URL_MEDUSA } },
    },
  ],

  featureFlags: {
    translation: true,
  },
})
