/**
 * ═══════════════════════════════════════════════════════════════════════
 *  TƯỜNG LỬA CÔNG BỐ (Claim Firewall)  ·  v1.1
 * ═══════════════════════════════════════════════════════════════════════
 *  VÌ SAO CÓ FILE NÀY:
 *  Rau củ lên men chạm vào vùng "probiotic / công bố sức khoẻ".
 *  Quy định khác nhau theo QUỐC GIA, không theo NGÔN NGỮ:
 *
 *   • EU  — "probiotic" BỊ COI LÀ health claim (Quy định 1924/2006).
 *           >400 hồ sơ nộp EFSA, chỉ 1 được duyệt. Nhiều nước EU cấm cả
 *           câu "chứa lợi khuẩn sống".
 *   • US  — FDA không quản chặt rau củ lên men; chủng vi sinh cần GRAS.
 *   • JP  — vi khuẩn lactic được phép rộng; 7 luật chi phối nhập khẩu.
 *   • VN  — NĐ 15/2018 về ATTP; công bố sức khoẻ phải có hồ sơ đăng ký.
 *
 *  ⇒ Cùng tiếng Anh nhưng en-US nói "probiotic" được, en-IE thì KHÔNG.
 *  ⇒ Locale PHẢI là mã thị trường (BCP 47), không phải mã ngôn ngữ.
 *
 *  DÙNG KHI NÀO: chạy trước khi ghi bất kỳ bản dịch nào do AI sinh ra.
 * ───────────────────────────────────────────────────────────────────────
 *  ⚠️ GHI CHÚ KỸ THUẬT QUAN TRỌNG (v1.1):
 *  KHÔNG dùng \b của JavaScript với tiếng Việt. \b chỉ hiểu [A-Za-z0-9_],
 *  nên /\bđiều/ KHÔNG khớp "Giúp điều trị" (đ không phải ký tự \w), và
 *  /hoá\b/ KHÔNG khớp "tiêu hoá." (á không phải \w).
 *  → Dùng hàm vb() bên dưới: ranh giới từ theo Unicode (\p{L}\p{N} + cờ u).
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * vb = "vietnamese boundary" — tạo regex có ranh giới từ hiểu Unicode.
 * Thay thế cho \b vốn hỏng với chữ có dấu.
 * @example vb("điều\\s+trị")  →  khớp "điều trị" nhưng không khớp "xđiều trịy"
 */
export const vb = (pattern: string): RegExp =>
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, "iu")

export type ClaimRule = {
  locale: string
  market: string
  /** Cụm từ TUYỆT ĐỐI không được xuất hiện */
  forbidden: RegExp[]
  /** Cụm từ cần người duyệt trước khi đăng */
  review: RegExp[]
  note: string
}

export const CLAIM_RULES: ClaimRule[] = [
  {
    locale: "vi-VN",
    market: "Việt Nam",
    forbidden: [
      vb("chữa\\s+(khỏi|được|bệnh)"),
      vb("điều\\s+trị\\s+(bệnh|ung\\s*thư|tiểu\\s*đường|viêm)"),
      vb("thay\\s+thế\\s+thuốc"),
      vb("thuốc\\s+chữa"),
      vb("đặc\\s+trị"),
      vb("(120|150)\\s*tuổi"),               // Rủi ro R13 — VPH không cam kết tuổi thọ
      vb("kéo\\s+dài\\s+tuổi\\s+thọ\\s+(lên|tới|đến)"),
      vb("cam\\s+kết\\s+(khỏi|hết)\\s+bệnh"),
    ],
    review: [
      vb("probiotic|lợi\\s*khuẩn|men\\s+vi\\s+sinh"),
      vb("tăng\\s+cường\\s+miễn\\s+dịch"),
      vb("hỗ\\s+trợ\\s+(tiêu\\s*hoá|tiêu\\s*hóa|đường\\s+ruột)"),
      vb("giảm\\s+cân"),
    ],
    note:
      "NĐ 15/2018 — công bố tác dụng sức khoẻ phải có hồ sơ đăng ký. " +
      "KHÔNG dùng ngôn ngữ như thuốc chữa bệnh.",
  },
  {
    locale: "en-US",
    market: "Hoa Kỳ",
    forbidden: [
      vb("(cure|cures|treat|treats|prevent|prevents)\\s+\\w*\\s*(disease|cancer|diabetes|illness)"),
      vb("FDA[-\\s]approved"),               // Sai sự thật: FDA không "duyệt" thực phẩm
      vb("clinically\\s+proven\\s+to\\s+(cure|treat)"),
      vb("replaces?\\s+(medication|medicine)"),
      vb("(120|150)\\s*years?\\s+old"),
    ],
    review: [
      vb("probiotic|probiotics"),            // Chỉ dùng nếu chủng đạt GRAS
      vb("immune\\s+(support|boost|boosting)"),
      vb("gut\\s+health"),
      vb("live\\s+cultures?"),
    ],
    note:
      "FDA không quản chặt rau củ lên men, nhưng chủng vi sinh phải đạt GRAS " +
      "mới được gọi 'probiotic'. Structure/function claim cần disclaimer.",
  },
  {
    locale: "en-IE",
    market: "Ireland (EU) — MẪU CHO TOÀN EU",
    forbidden: [
      vb("probiotic|probiotics"),            // ⛔ EU coi đây LÀ health claim
      vb("live\\s+(cultures?|bacteria)"),
      vb("gut\\s+health"),
      vb("immune\\s+(support|boost|boosting)"),
      vb("digestive\\s+health"),
      vb("(cure|cures|treat|treats|prevent|prevents)"),
      vb("good\\s+bacteria"),
    ],
    review: [
      vb("fermented"),
      vb("contains\\s+lactobacillus"),       // Được, NẾU không kèm health claim
      vb("traditional\\s+recipe"),
    ],
    note:
      "⛔ EU NGHIÊM NGẶT NHẤT. Reg 1924/2006: >400 hồ sơ probiotic nộp EFSA, " +
      "chỉ 1 được duyệt. Chỉ được liệt kê tên chủng vi sinh KHI KHÔNG kèm " +
      "bất kỳ công bố sức khoẻ nào. Dùng rule này làm mẫu cho mọi locale EU.",
  },
  {
    locale: "ja-JP",
    market: "Nhật Bản",
    forbidden: [
      /病気を治(す|る)/u,
      /癌に効く/u,
      /薬の代わり/u,
      vb("(cure|cures|treat|treats)\\s+disease"),
    ],
    review: [
      /プロバイオティクス/u,
      /乳酸菌/u,
      /腸内環境/u,
      /免疫力/u,
    ],
    note:
      "Vi khuẩn lactic được phép rộng rãi. Công bố chức năng cần theo chế độ " +
      "FFC (機能性表示食品) hoặc Tokuho (特定保健用食品). 7 luật chi phối nhập khẩu.",
  },
]

export type GuardFinding = {
  level: "BLOCK" | "REVIEW"
  locale: string
  field: string
  pattern: string
  excerpt: string
}

/**
 * Soi một bộ bản dịch trước khi ghi vào DB.
 * @returns danh sách vi phạm. Mảng rỗng = an toàn.
 */
export function guardTranslation(
  locale: string,
  fields: Record<string, unknown>
): GuardFinding[] {
  const rule = CLAIM_RULES.find((r) => r.locale === locale)

  // Fail-safe: locale lạ thì CHẶN, không cho lọt.
  if (!rule) {
    return [
      {
        level: "BLOCK",
        locale,
        field: "*",
        pattern: "locale-chua-khai-bao",
        excerpt:
          `Locale "${locale}" chưa có luật claim. ` +
          `Bổ sung vào CLAIM_RULES trước khi dùng.`,
      },
    ]
  }

  const out: GuardFinding[] = []
  for (const [field, raw] of Object.entries(fields)) {
    if (typeof raw !== "string" || !raw.trim()) continue
    for (const re of rule.forbidden) {
      const m = raw.match(re)
      if (m) out.push({ level: "BLOCK", locale, field, pattern: String(re), excerpt: m[0] })
    }
    for (const re of rule.review) {
      const m = raw.match(re)
      if (m) out.push({ level: "REVIEW", locale, field, pattern: String(re), excerpt: m[0] })
    }
  }
  return out
}

/**
 * Ném lỗi nếu có vi phạm mức BLOCK. Bọc ngoài MỌI bản dịch do AI sinh.
 * @returns danh sách mục cần người duyệt (REVIEW)
 */
export function assertSafeTranslation(
  locale: string,
  fields: Record<string, unknown>
): GuardFinding[] {
  const findings = guardTranslation(locale, fields)
  const blocks = findings.filter((f) => f.level === "BLOCK")
  if (blocks.length) {
    throw new Error(
      `[CLAIM GUARD] Chặn ${blocks.length} vi phạm ở locale ${locale}:\n` +
        blocks.map((b) => `  • ${b.field}: "${b.excerpt}"`).join("\n")
    )
  }
  return findings.filter((f) => f.level === "REVIEW")
}
