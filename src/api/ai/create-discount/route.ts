import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { createPromotionsWorkflow } from "@medusajs/medusa/core-flows";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { checkAuth } from "../../../lib/ai-auth";
import { DISCOUNT_LIMITS } from "../../../lib/discount-limits";
import { ghiNhatKy } from "../../../lib/nhat-ky";

/**
 * Tạo mã giảm giá (tao_ma_giam_gia) — createPromotionsWorkflow.
 *  - percent: giảm theo % (số nguyên 1..30)  hoặc  amount: giảm số tiền cố định (VND, nguyên 1.000..500.000).
 *    Cả hai thì amount được ưu tiên (như cũ). Biên độ chặn ở server (src/lib/discount-limits.ts).
 *  - ends_at (tuỳ chọn): ISO, phải ở tương lai => campaign.ends_at của Medusa.
 *  - usage_limit (tuỳ chọn): số nguyên dương => `limit` của chính promotion (Medusa 2.17 đếm `used`).
 *    Chỉ khi có ends_at mới tạo kèm campaign `AI-<code>-<timestamp>` (campaign_identifier là unique và
 *    KHÔNG bị xoá theo promotion, nên thêm timestamp để tạo lại mã đã xoá không bị báo trùng).
 *  - code được chuẩn hoá: trim, chữ hoa, chỉ [A-Z0-9_-], 3..32 ký tự.
 *  - percent/amount phải là kiểu number.
 *  - currency: chỉ chấp nhận vnd.
 * Mã lỗi: unauthorized 401, invalid_value 400, duplicate_code 409, internal_error 500.
 * Contract thành công giữ nguyên: { ok, message, promotion }.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res
      .status(401)
      .json({ error: "Unauthorized: Invalid x-ai-secret-key header", code: "unauthorized" });
  }
  const b = (req.body ?? {}) as {
    code?: unknown; percent?: unknown; amount?: unknown; currency?: unknown;
    ends_at?: unknown; usage_limit?: unknown;
  };
  const bad = (error: string) => res.status(400).json({ error, code: "invalid_value" });

  const code = typeof b.code === "string" ? b.code.trim().toUpperCase() : "";
  if (!code) return bad("Thiếu code (mã giảm giá)");
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
    return bad("Mã giảm giá chỉ gồm chữ, số, gạch ngang/gạch dưới, dài 3 đến 32 ký tự.");
  }
  const present = (v: unknown) => v !== undefined && v !== null && v !== "" && v !== 0;
  if ((present(b.amount) && typeof b.amount !== "number") || (present(b.percent) && typeof b.percent !== "number")) {
    return bad("percent và amount phải là số.");
  }
  const hasAmount = present(b.amount);
  const hasPercent = present(b.percent);
  if (!hasAmount && !hasPercent) return bad("Cần percent (%) hoặc amount (số tiền).");

  const currency_code = (typeof b.currency === "string" && b.currency ? b.currency : "vnd").toLowerCase();
  if (currency_code !== "vnd") return bad("Chỉ hỗ trợ mã giảm giá tiền VND.");

  const L = DISCOUNT_LIMITS;
  let value: number;
  if (hasAmount) {
    value = Number(b.amount);
    if (!Number.isInteger(value) || value < L.amountMinVnd || value > L.amountMaxVnd) {
      return bad(`Số tiền giảm phải là số nguyên từ ${L.amountMinVnd.toLocaleString("vi-VN")} đến ${L.amountMaxVnd.toLocaleString("vi-VN")} VND.`);
    }
  } else {
    value = Number(b.percent);
    if (!Number.isInteger(value) || value < L.percentMin || value > L.percentMax) {
      return bad(`Phần trăm giảm phải là số nguyên từ ${L.percentMin} đến ${L.percentMax}.`);
    }
  }

  let endsAt: Date | null = null;
  if (b.ends_at !== undefined && b.ends_at !== null && b.ends_at !== "") {
    const d = typeof b.ends_at === "string" ? new Date(b.ends_at) : new Date(NaN);
    if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
      return bad("ends_at phải là thời điểm ISO hợp lệ ở tương lai.");
    }
    endsAt = d;
  }
  let usageLimit: number | null = null;
  if (b.usage_limit !== undefined && b.usage_limit !== null && b.usage_limit !== "") {
    const n = Number(b.usage_limit);
    if (typeof b.usage_limit === "boolean" || !Number.isInteger(n) || n < 1) {
      return bad("usage_limit phải là số nguyên dương.");
    }
    usageLimit = n;
  }

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  try {
    const promotionModule: any = req.scope.resolve(Modules.PROMOTION);
    const existed = await promotionModule.listPromotions({ code: [code] }, { take: 1 });
    if ((existed?.length ?? 0) > 0) {
      return res.status(409).json({ error: `Mã giảm giá ${code} đã tồn tại.`, code: "duplicate_code" });
    }

    const application_method = {
      type: hasAmount ? "fixed" : "percentage",
      target_type: "order",
      allocation: "across",
      value,
      currency_code,
    };
    const campaign = endsAt
      ? { name: `AI-${code}`, campaign_identifier: `AI-${code}-${Date.now()}`, ends_at: endsAt }
      : undefined;

    const { result } = await createPromotionsWorkflow(req.scope).run({
      input: {
        promotionsData: [
          {
            code, type: "standard", status: "active", application_method,
            ...(usageLimit ? { limit: usageLimit } : {}),
            ...(campaign ? { campaign } : {}),
          } as any,
        ],
      },
    });
    await ghiNhatKy(req, {
      doi_tuong: "promotion",
      doi_tuong_id: code,
      hanh_dong: "tao_ma_giam_gia",
      sau: { code, type: application_method.type, value, ends_at: endsAt?.toISOString() ?? null, usage_limit: usageLimit },
    });
    return res.status(200).json({
      ok: true,
      message: `Đã tạo mã giảm giá ${code}.`,
      promotion: Array.isArray(result) ? result[0] : result,
    });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    logger.error(`create-discount lỗi: ${msg}`);
    // Chỉ coi là trùng MÃ khi lỗi nói về promotion code, không phải campaign_identifier.
    if (/promotion/i.test(msg) && /code/i.test(msg) && /already exists|duplicate|unique/i.test(msg) && !/campaign/i.test(msg)) {
      return res.status(409).json({ error: `Mã giảm giá ${code} đã tồn tại.`, code: "duplicate_code" });
    }
    return res.status(500).json({ error: msg, code: "internal_error" });
  }
}
