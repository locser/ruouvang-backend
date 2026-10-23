import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { checkAuth } from "../../../lib/ai-auth";

/**
 * GET /ai/store-locations — danh sách chi nhánh cho chatbot.
 *
 * Nguồn: module Stock Location của Medusa (admin cấu hình ở
 * Settings > Locations & Shipping). Các khoá đọc từ metadata:
 *   opening_hours, maps_url (http/https), hidden (true|"true" => ẩn), sort_order (số).
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
      const h = l?.metadata?.hidden;
      return !(h === true || h === "true");
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
