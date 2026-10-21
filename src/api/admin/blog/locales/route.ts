import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { BLOG_DEFAULT_LOCALE } from "../../../../modules/blog/service"

/**
 * GET /admin/blog/locales
 * Trả danh sách locale ĐANG BẬT (lấy từ Translation Module) để form Admin
 * hiện đúng bấy nhiêu ô nhập. Bật thêm ngôn ngữ = chạy setup-locales.ts →
 * form tự có thêm ô, không sửa code.
 */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  try {
    const translation: any = req.scope.resolve(Modules.TRANSLATION)
    const locales = await translation.listLocales({})
    if (Array.isArray(locales) && locales.length) {
      res.json({
        locales: locales.map((l: any) => ({ code: l.code, name: l.name })),
      })
      return
    }
  } catch (e) {
    // Translation Module chưa sẵn sàng → rơi về locale mặc định bên dưới.
  }

  res.json({
    locales: [{ code: BLOG_DEFAULT_LOCALE, name: "Tiếng Việt (Việt Nam)" }],
  })
}
