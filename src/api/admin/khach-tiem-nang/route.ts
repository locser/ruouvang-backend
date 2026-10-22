import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { KHACH_TIEM_NANG_MODULE } from "../../../modules/khach-tiem-nang";

/** GET /admin/khach-tiem-nang — danh sách khách để lại số, mới nhất trước. Cần đăng nhập admin. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: any = req.scope.resolve(KHACH_TIEM_NANG_MODULE);
  const q = req.query as Record<string, string | undefined>;
  const filters: Record<string, unknown> = {};
  if (q.trang_thai) filters.trang_thai = q.trang_thai;
  const take = Math.min(Number(q.limit) || 50, 200);
  const skip = Math.max(Number(q.offset) || 0, 0);
  const [khach, count] = await service.listAndCountKhachTiemNangs(filters, {
    take,
    skip,
    order: { created_at: "DESC" },
  });
  res.json({ khach_tiem_nang: khach, count, limit: take, offset: skip });
}
