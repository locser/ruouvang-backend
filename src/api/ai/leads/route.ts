import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { checkAuth } from "../../../lib/ai-auth";
import { KHACH_TIEM_NANG_MODULE } from "../../../modules/khach-tiem-nang";

/**
 * Chatbot đẩy khách tiềm năng (đã để lại số điện thoại) về backend để lưu.
 *
 * POST /ai/leads
 * Body: { conversation_id, phone, name?, need? }
 *
 * Upsert theo conversation_id nên chatbot gửi lại bao nhiêu lần cũng không nhân
 * đôi dòng (chatbot thử lại khi lần trước lỗi mạng). Không đụng tới trang_thai
 * khi cập nhật, để việc nhân viên đã đánh dấu "đã gọi" không bị ghi đè.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Unauthorized: Invalid x-ai-secret-key header" });
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const cat = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

  const conversationId = cat(body.conversation_id, 100);
  const sdt = cat(body.phone, 20);
  if (!conversationId || !sdt || !/^0\d{9,10}$/.test(sdt)) {
    return res.status(400).json({ error: "Cần conversation_id và phone (10-11 chữ số, đầu 0)" });
  }

  const service: any = req.scope.resolve(KHACH_TIEM_NANG_MODULE);
  const [co] = await service.listKhachTiemNangs({ conversation_id: conversationId }, { take: 1 });
  const ten = cat(body.name, 100);
  const nhuCau = cat(body.need, 500);

  if (co) {
    await service.updateKhachTiemNangs({
      id: co.id,
      so_dien_thoai: sdt,
      ...(ten ? { ten } : {}),
      ...(nhuCau ? { nhu_cau: nhuCau } : {}),
    });
    return res.json({ ok: true, id: co.id, created: false });
  }
  const moi = await service.createKhachTiemNangs({
    conversation_id: conversationId,
    so_dien_thoai: sdt,
    ten,
    nhu_cau: nhuCau,
  });
  return res.json({ ok: true, id: moi.id, created: true });
}
