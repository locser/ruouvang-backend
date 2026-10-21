import {
  defineMiddlewares,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { checkAuth } from "../lib/ai-auth"
import {
  PostAdminAddSection,
  PostAdminCreatePageTemplate,
  PostAdminReorderSections,
  PostAdminUpdatePageTemplate,
  PostAdminUpdateSection,
} from "./admin/page-builder/validators"
import {
  PostAdminCreateBlogPost,
  PostAdminUpdateBlogPost,
  PostAdminCreateBlogCategory,
  PostAdminUpdateBlogCategory,
  PostAdminCreateBlogTag,
  PostAdminUpdateBlogTag,
  PostAdminCreateBlogAuthor,
  PostAdminUpdateBlogAuthor,
} from "./admin/blog/validators"
import { PutAdminAppSetting, PutAdminAppSettings } from "./admin/app-settings/validators"

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  MIDDLEWARE — kiểm tra dữ liệu vào cho Page Builder
 * ═══════════════════════════════════════════════════════════════════════
 *  ⚠️ Dùng `methods: [...]` (số nhiều, mảng).
 *     `method:` (số ít) tuy còn chạy nhưng đã bị đánh dấu khai tử
 *     (deprecated) trong mã nguồn 2.16.0 — tài liệu web vẫn dạy cách cũ.
 * ═══════════════════════════════════════════════════════════════════════
 */
/**
 * Chốt chặn xác thực cho TOÀN BỘ nhánh /ai/*.
 *
 * Vì sao đặt ở middleware chứ không chỉ sửa trong từng route: đợt vá trước
 * làm thủ công từng file và sót 12/15 route. Kiểm ở một chỗ duy nhất nghĩa là
 * route /ai/* viết mới sau này được bảo vệ mặc định — lập trình viên phải cố
 * ý mở ra mới hở, thay vì phải nhớ đóng lại mới kín.
 *
 * Fail-closed: `checkAuth` trả false khi CONFIG_INTERNAL_SERVICE_KEY chưa cấu hình.
 * So sánh khoá theo kiểu không phụ thuộc thời gian, xem lib/ai-auth.ts.
 */
function xacThucAI(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  if (!checkAuth(req)) {
    res
      .status(401)
      .json({ error: "Unauthorized: Invalid or missing x-ai-secret-key header" })
    return
  }
  next()
}

/**
 * Đọc locale đang xem cho nhánh /store/blog/*.
 *
 * Các route blog đã viết `const locale = (req as ...).locale` kèm chú thích
 * "req.locale có sẵn (?locale → x-medusa-locale → mặc định của Store)" — nhưng
 * KHÔNG có middleware nào đặt trường đó. Hệ quả: `req.locale` luôn `undefined`,
 * mọi lời gọi rơi về `BLOG_DEFAULT_LOCALE` = vi-VN, và `?locale=en-US` bị bỏ
 * qua trong im lặng. Storefront Red Apron song ngữ nên cần bản tiếng Anh thật,
 * không phải bản tiếng Việt trả về dưới một cái tên khác.
 *
 * Chỉ NHẬN mã BCP-47 dạng `xx-YY` (xem setup-locales.ts: locale là mã THỊ
 * TRƯỜNG, không phải mã ngôn ngữ trần). Sai định dạng thì bỏ qua để service tự
 * rơi về mặc định — `pick()` trong blog/service.ts đã có sẵn nhánh dự phòng.
 */
const docLocale = (
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) => {
  const tho =
    (typeof req.query?.locale === "string" ? req.query.locale : "") ||
    (typeof req.headers["x-medusa-locale"] === "string"
      ? (req.headers["x-medusa-locale"] as string)
      : "")
  if (/^[a-z]{2}-[A-Z]{2}$/.test(tho)) {
    ;(req as MedusaRequest & { locale?: string }).locale = tho
  }
  next()
}

export default defineMiddlewares({
  routes: [
    {
      // Bao trùm cả /ai/report/revenue nhờ ký tự đại diện.
      matcher: "/ai/*",
      middlewares: [xacThucAI],
    },
    {
      matcher: "/store/blog/*",
      methods: ["GET"],
      middlewares: [docLocale],
    },
    {
      matcher: "/admin/page-builder/templates",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAdminCreatePageTemplate)],
    },
    {
      matcher: "/admin/page-builder/templates/:id",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAdminUpdatePageTemplate)],
    },
    {
      matcher: "/admin/page-builder/templates/:id/sections",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAdminAddSection)],
    },
    {
      matcher: "/admin/page-builder/templates/:id/reorder",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAdminReorderSections)],
    },
    {
      matcher: "/admin/page-builder/sections/:id",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAdminUpdateSection)],
    },

    // ───────────────────────── Cài đặt cửa hàng ─────────────────────────
    {
      matcher: "/admin/app-settings",
      methods: ["PUT"],
      middlewares: [validateAndTransformBody(PutAdminAppSettings)],
    },
    {
      matcher: "/admin/app-settings/:key",
      methods: ["PUT"],
      middlewares: [validateAndTransformBody(PutAdminAppSetting)],
    },

    // ───────────────────────────── Blog ─────────────────────────────
    {
      matcher: "/admin/blog/posts",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAdminCreateBlogPost)],
    },
    {
      matcher: "/admin/blog/posts/:id",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAdminUpdateBlogPost)],
    },
    {
      matcher: "/admin/blog/categories",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAdminCreateBlogCategory)],
    },
    {
      matcher: "/admin/blog/categories/:id",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAdminUpdateBlogCategory)],
    },
    {
      matcher: "/admin/blog/tags",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAdminCreateBlogTag)],
    },
    {
      matcher: "/admin/blog/tags/:id",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAdminUpdateBlogTag)],
    },
    {
      matcher: "/admin/blog/authors",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAdminCreateBlogAuthor)],
    },
    {
      matcher: "/admin/blog/authors/:id",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAdminUpdateBlogAuthor)],
    },
  ],
})
