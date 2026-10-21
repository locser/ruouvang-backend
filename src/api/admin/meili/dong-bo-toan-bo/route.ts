import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  choMeiliXuLy,
  datCauHinhIndex,
  doiSoatMeili,
} from "../../../../lib/meili-dong-bo-toan-bo"

/**
 * POST /admin/meili/dong-bo-toan-bo — đồng bộ TOÀN BỘ sản phẩm lên Meilisearch.
 *
 * Làm đúng việc của `sync-meili.ts` + job đêm, nhưng bấm được từ admin: trên
 * máy chủ Docker người vận hành không có quyền chạy `medusa exec`.
 *
 *   1. Cấu hình index (tạo index, khoá chính, trường lọc/sắp xếp/tìm). PHẢI
 *      chạy trước: bước 2 lọc theo `tenant_id`, Meili trắng thì chưa lọc được.
 *   2. Đối soát ba chiều: thiếu → thêm · thừa → xoá · lệch → cập nhật.
 *   3. Đợi Meili xử lý xong, đếm tác vụ hỏng — không báo "xong" khi chưa kiểm.
 *
 * Mỗi lúc chỉ một lượt: bấm lần hai khi lượt trước chưa xong trả 409.
 */
let dangChay = false

export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)

  if (dangChay) {
    return res.status(409).json({ ok: false, error: "Đang đồng bộ, vui lòng đợi lượt trước chạy xong." })
  }
  dangChay = true
  const tuLuc = Date.now()

  try {
    await datCauHinhIndex(logger)
    const doiSoat = await doiSoatMeili()
    const xuLy = await choMeiliXuLy(tuLuc)

    const canhBao: string[] = []
    if (doiSoat.da_doc !== doiSoat.tong_trong_medusa) {
      canhBao.push(`Chỉ đọc được ${doiSoat.da_doc}/${doiSoat.tong_trong_medusa} sản phẩm.`)
    }
    if (xuLy.so_tac_vu_hong > 0) {
      canhBao.push(`${xuLy.so_tac_vu_hong} tác vụ Meilisearch bị lỗi: ${xuLy.loi_gan_nhat ?? "không rõ"}`)
    }
    if (xuLy.con_dang_xu_ly) {
      canhBao.push("Meilisearch vẫn đang xử lý — số liệu trên trang tìm kiếm sẽ khớp sau ít phút.")
    }

    const ok = doiSoat.da_doc === doiSoat.tong_trong_medusa && xuLy.so_tac_vu_hong === 0
    logger.info(
      `[dong-bo-toan-bo] ${ok ? "Xong" : "CÓ LỖI"}: ${doiSoat.da_doc} sản phẩm, thêm ${doiSoat.them_moi}, ` +
      `cập nhật ${doiSoat.cap_nhat}, xoá ${doiSoat.xoa_mo_coi}, hỏng ${xuLy.so_tac_vu_hong}`
    )
    return res.status(ok ? 200 : 500).json({ ok, ...doiSoat, ...xuLy, canh_bao: canhBao })
  } catch (err: any) {
    logger.error(`[dong-bo-toan-bo] Thất bại: ${err?.message ?? err}`)
    return res.status(500).json({ ok: false, error: err?.message ?? "Đồng bộ thất bại" })
  } finally {
    dangChay = false
  }
}
