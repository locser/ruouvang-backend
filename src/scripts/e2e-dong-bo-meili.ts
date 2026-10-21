import { ExecArgs } from "@medusajs/framework/types"
import { POST as dongBoToanBo } from "../api/admin/meili/dong-bo-toan-bo/route"
import meilisearchNightlyReconcileJob from "../jobs/meilisearch-nightly-reconcile"
import { choMeiliXuLy } from "../lib/meili-dong-bo-toan-bo"
import { docToanBoIdTrongIndex, xoaKhoiMeili } from "../lib/meili-sync"

/**
 * E2E nút "Đồng bộ toàn bộ" (POST /admin/meili/dong-bo-toan-bo):
 *
 *   pnpm run test:e2e:dong-bo-meili
 *
 *   1. Chưa đăng nhập admin → 401 (gọi HTTP thật vào backend đang chạy)
 *   2. Gỡ 3 sản phẩm khỏi Meili → bấm đồng bộ → 3 sản phẩm quay lại
 *   3. Bấm lần nữa → 0 lệch
 *   4. Bấm hai lần cùng lúc → lượt sau bị từ chối 409
 *   5. Job đêm (dùng chung lib) vẫn chạy được
 *
 * Bước 2–4 gọi thẳng handler của route (không qua đăng nhập admin).
 * Ghi vào Meilisearch thật mà backend đang trỏ — chỉ chạy trên local/staging.
 */

const BACKEND = process.env.E2E_BACKEND_URL || `http://localhost:${process.env.SERVICE_PORT || 9000}`

export default async function e2eDongBoMeili({ container }: ExecArgs) {
  const loi: string[] = []
  const kiem = (dk: boolean, moTa: string) => {
    console.log(`${dk ? "  ✔" : "  ✘"} ${moTa}`)
    if (!dk) loi.push(moTa)
  }

  const bam = async () => {
    let status = 200
    let body: any = null
    const res: any = {
      status(s: number) { status = s; return res },
      json(b: any) { body = b; return res },
    }
    await dongBoToanBo({ scope: container } as any, res)
    return { status, body }
  }

  console.log("1. Chưa đăng nhập admin")
  const r401 = await fetch(`${BACKEND}/admin/meili/dong-bo-toan-bo`, { method: "POST" })
  kiem(r401.status === 401, `bị từ chối 401 (nhận ${r401.status})`)

  console.log("2. Gỡ 3 sản phẩm khỏi Meili rồi bấm đồng bộ")
  const r0 = await bam() // đưa index về trạng thái khớp trước khi thử
  kiem(r0.status === 200 && r0.body?.ok, `lượt nền chạy được (nhận ${r0.status} ${r0.body?.error ?? ""})`)
  const truoc = await docToanBoIdTrongIndex()
  const goBo = [...truoc.keys()].slice(0, 3)
  const tuLuc = Date.now()
  await xoaKhoiMeili(goBo)
  await choMeiliXuLy(tuLuc)
  const sauGo = await docToanBoIdTrongIndex()
  kiem(goBo.length === 3 && goBo.every((id) => !sauGo.has(id)), `đã gỡ 3 sản phẩm (index ${truoc.size} → ${sauGo.size})`)
  const r2 = await bam()
  const sauDongBo = await docToanBoIdTrongIndex()
  kiem(r2.status === 200 && r2.body?.ok, `bấm đồng bộ trả 200/ok (nhận ${r2.status})`)
  kiem(r2.body?.them_moi === 3, `báo thêm 3 (nhận thêm ${r2.body?.them_moi}, cập nhật ${r2.body?.cap_nhat}, gỡ ${r2.body?.xoa_mo_coi})`)
  kiem(goBo.every((id) => sauDongBo.has(id)), `3 sản phẩm đã quay lại (index ${sauDongBo.size})`)
  kiem(r2.body?.da_doc === r2.body?.tong_trong_medusa, `đọc đủ ${r2.body?.da_doc}/${r2.body?.tong_trong_medusa} sản phẩm`)
  kiem(r2.body?.so_tac_vu_hong === 0, `không có tác vụ Meili hỏng (nhận ${r2.body?.so_tac_vu_hong})`)

  console.log("3. Bấm lần nữa")
  const r3 = await bam()
  const lech = (r3.body?.them_moi ?? -1) + (r3.body?.cap_nhat ?? -1) + (r3.body?.xoa_mo_coi ?? -1)
  kiem(r3.status === 200 && lech === 0, `0 lệch (nhận thêm ${r3.body?.them_moi}, cập nhật ${r3.body?.cap_nhat}, gỡ ${r3.body?.xoa_mo_coi})`)

  console.log("4. Bấm hai lần cùng lúc")
  const [a, b] = await Promise.all([bam(), bam()])
  kiem([a.status, b.status].sort().join(",") === "200,409", `một lượt chạy, một lượt bị 409 (nhận ${a.status}, ${b.status})`)

  console.log("5. Job đêm")
  let jobLoi: string | null = null
  await meilisearchNightlyReconcileJob(container as any).catch((e: any) => { jobLoi = e?.message ?? String(e) })
  kiem(jobLoi === null, `job đêm chạy xong không lỗi${jobLoi ? ` (${jobLoi})` : ""}`)

  if (loi.length) {
    console.log(`E2E THẤT BẠI: ${loi.length} kiểm tra sai`)
    process.exitCode = 1
  } else {
    console.log("E2E ĐẠT: mọi kiểm tra đều đúng")
  }
}
