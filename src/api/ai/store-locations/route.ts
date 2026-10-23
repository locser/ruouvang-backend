import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { checkAuth } from "../../../lib/ai-auth";

/**
 * GET /ai/store-locations — danh sách chi nhánh cho chatbot.
 *
 * Nguồn: module Stock Location của Medusa. stock_location ở đây chủ yếu là KHO,
 * nên OPT-IN: chỉ trả location có metadata.show_to_customer = true (nhận cả "true")
 * và có address_1. Location không có metadata này không bao giờ lộ cho khách.
 *
 * Hướng dẫn admin: vào Settings > Locations, mở location, thêm metadata:
 *   show_to_customer = true        (bắt buộc để hiện cho khách)
 *   opening_hours    = "8h-22h"    (tuỳ chọn)
 *   maps_url         = https://... (tuỳ chọn, chỉ nhận http/https)
 *   sort_order       = 1           (tuỳ chọn, số nhỏ lên trước)
 * và điền địa chỉ (address_1 bắt buộc).
 */

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function cleanText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function cleanUrl(v: unknown): string | null {
  const t = cleanText(v);
  if (!t) return null;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:" ? t : null;
  } catch {
    return null;
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized: Invalid or missing x-ai-secret-key header" });
  }

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  try {
    const { data } = await query.graph({
      entity: "stock_location",
      fields: ["id", "name", "metadata", "address.*"],
    });

    const rows = ((data ?? []) as any[]).filter((l) => {
      const v = l?.metadata?.show_to_customer;
      if (!(v === true || v === "true")) return false;
      return cleanText(l?.address?.address_1) !== null;
    });

    const withSort = rows.map((l) => ({ l, sort: toNumberOrNull(l?.metadata?.sort_order) }));
    withSort.sort((a, b) => {
      if (a.sort !== null && b.sort !== null && a.sort !== b.sort) return a.sort - b.sort;
      if (a.sort !== null && b.sort === null) return -1;
      if (a.sort === null && b.sort !== null) return 1;
      return String(a.l.name ?? "").localeCompare(String(b.l.name ?? ""), "vi");
    });

    const stores = withSort.map(({ l }) => {
      const a = l.address ?? {};
      return {
        id: l.id,
        name: l.name,
        address: [a.address_1, a.address_2, a.city, a.province]
          .map(cleanText)
          .filter(Boolean)
          .join(", "),
        phone: cleanText(a.phone),
        opening_hours: cleanText(l.metadata?.opening_hours),
        maps_url: cleanUrl(l.metadata?.maps_url),
      };
    });

    return res.status(200).json({ stores });
  } catch (err: any) {
    logger.error(`[store-locations] ${err?.message ?? err}`);
    return res.status(500).json({ error: "Không đọc được danh sách chi nhánh" });
  }
}
