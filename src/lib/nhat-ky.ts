import { MedusaRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { NHAT_KY_MODULE } from "../modules/nhat-ky";

export interface MucNhatKy {
  doi_tuong: "order" | "payment" | "variant" | "promotion";
  doi_tuong_id: string;
  hanh_dong: string;
  truoc?: Record<string, unknown> | null;
  sau?: Record<string, unknown> | null;
  ghi_chu?: string | null;
}

/**
 * Ghi một dòng nhật ký. Người làm lấy từ phiên admin nếu có, không thì ghi
 * "ai-operator" (thao tác qua khóa AI).
 *
 * Lỗi ghi nhật ký KHÔNG làm hỏng thao tác đã chạy (tiền đã thu, đơn đã giao).
 * Lỗi được ghi vào log máy chủ để kiểm tra lại.
 */
export async function ghiNhatKy(req: MedusaRequest, muc: MucNhatKy): Promise<void> {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  try {
    const nguoi =
      ((req as any).auth_context?.actor_id as string | undefined) ?? "ai-operator";
    const service: any = req.scope.resolve(NHAT_KY_MODULE);
    await service.createNhatKyEntries({
      doi_tuong: muc.doi_tuong,
      doi_tuong_id: muc.doi_tuong_id,
      hanh_dong: muc.hanh_dong,
      nguoi_thuc_hien: nguoi,
      truoc: muc.truoc ?? null,
      sau: muc.sau ?? null,
      ghi_chu: muc.ghi_chu ?? null,
    });
  } catch (e: any) {
    logger.error(`[nhat-ky] Không ghi được nhật ký ${muc.hanh_dong} cho ${muc.doi_tuong_id}: ${e?.message ?? e}`);
  }
}
