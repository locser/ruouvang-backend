/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SEED BLOG CHO RED APRON — tác giả · danh mục · thẻ · bài viết mở màn
 *
 *  Chạy TRONG container Red Apron:
 *    docker exec medusa-backend-redapron sh -c \
 *      "cd /app/apps/backend && npx medusa exec ./src/scripts/seed-blog-redapron.ts"
 *
 *  Cây danh mục bám đúng các chuyên mục blog của redapron.vn để đường dẫn cũ
 *  từ Google ánh xạ 1–1 sang được:
 *    /blogs/kien-thuc-ruou-vang · /blogs/ket-hop-ruou-vang-am-thuc
 *    /blogs/cam-nang-ve-ruou    · /blogs/ruou-manh-ruou-mui
 *    /blogs/qua-tang            · /blogs/tin-moi · /blogs/su-kien
 *
 *  Bài viết SONG NGỮ vi-VN / en-US, nội dung Markdown — đúng thứ mà giao diện
 *  storefront-redapron đọc ra. Đây là bài mở màn để đội nội dung có khuôn mẫu
 *  thật mà viết tiếp, không phải chỗ điền văn bản giả.
 *
 *  Idempotent theo slug: chạy lại KHÔNG tạo trùng, KHÔNG ghi đè bài đã sửa.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { BLOG_MODULE } from "../modules/blog"
import type BlogModuleService from "../modules/blog/service"

export default async function seedBlogRedApron({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service: BlogModuleService = container.resolve(BLOG_MODULE)

  logger.info("═══ Seed Blog Red Apron (song ngữ vi-VN / en-US) ═══")

  // ── 1. Tác giả ───────────────────────────────────────────────────────────
  let [author] = await service.listBlogAuthors({ name: "Red Apron Wine Team" })
  if (!author) {
    ;[author] = await service.createBlogAuthors([
      {
        name: "Red Apron Wine Team",
        bio: {
          "vi-VN":
            "Đội ngũ chuyên gia rượu vang của Red Apron — chia sẻ kiến thức chọn, thử và thưởng rượu.",
          "en-US":
            "Red Apron's wine specialists — notes on choosing, tasting and enjoying wine.",
        },
        avatar: null,
      },
    ])
    logger.info(`  ✔ Tác giả "${author.name}"`)
  }

  // ── 2. Danh mục ──────────────────────────────────────────────────────────
  const catDefs = [
    { slug: "kien-thuc-ruou-vang", rank: 1, name: { "vi-VN": "Kiến thức rượu vang", "en-US": "Wine knowledge" } },
    { slug: "ket-hop-ruou-vang-am-thuc", rank: 2, name: { "vi-VN": "Rượu vang & ẩm thực", "en-US": "Wine & food pairing" } },
    { slug: "cam-nang-ve-ruou", rank: 3, name: { "vi-VN": "Cẩm nang về rượu", "en-US": "Wine handbook" } },
    { slug: "ruou-manh-ruou-mui", rank: 4, name: { "vi-VN": "Rượu mạnh & rượu mùi", "en-US": "Spirits & liqueurs" } },
    { slug: "vung-ruou-vang", rank: 5, name: { "vi-VN": "Vùng rượu vang", "en-US": "Wine regions" } },
    { slug: "nha-san-xuat", rank: 6, name: { "vi-VN": "Nhà sản xuất", "en-US": "Producers" } },
    { slug: "qua-tang", rank: 7, name: { "vi-VN": "Quà tặng", "en-US": "Gifting" } },
    { slug: "tin-moi", rank: 8, name: { "vi-VN": "Tin mới", "en-US": "News" } },
    { slug: "su-kien", rank: 9, name: { "vi-VN": "Sự kiện", "en-US": "Events" } },
  ]
  const catId: Record<string, string> = {}
  for (const c of catDefs) {
    let [cat] = await service.listBlogCategories({ slug: c.slug })
    if (!cat) {
      ;[cat] = await service.createBlogCategories([
        { slug: c.slug, rank: c.rank, name: c.name, description: null },
      ])
      logger.info(`  ✔ Danh mục "${c.slug}"`)
    }
    catId[c.slug] = cat.id
  }

  // ── 3. Thẻ ───────────────────────────────────────────────────────────────
  const tagDefs = [
    { slug: "bordeaux", name: { "vi-VN": "Bordeaux", "en-US": "Bordeaux" } },
    { slug: "champagne", name: { "vi-VN": "Champagne", "en-US": "Champagne" } },
    { slug: "nguoi-moi-bat-dau", name: { "vi-VN": "Người mới bắt đầu", "en-US": "Beginners" } },
    { slug: "bao-quan", name: { "vi-VN": "Bảo quản", "en-US": "Storage" } },
    { slug: "am-thuc-viet", name: { "vi-VN": "Ẩm thực Việt", "en-US": "Vietnamese cuisine" } },
  ]
  const tagId: Record<string, string> = {}
  for (const t of tagDefs) {
    let [tag] = await service.listBlogTags({ slug: t.slug })
    if (!tag) {
      ;[tag] = await service.createBlogTags([{ slug: t.slug, name: t.name }])
      logger.info(`  ✔ Thẻ "${t.slug}"`)
    }
    tagId[t.slug] = tag.id
  }

  // ── 4. Bài viết mở màn ───────────────────────────────────────────────────
  const posts = [
    {
      slug: "nhiet-do-phuc-vu-ruou-vang",
      thumbnail:
        "https://cdn.hstatic.net/themes/200000692767/1001465560/14/section_bannerCus_img_2.jpg?v=642",
      category_ids: [catId["kien-thuc-ruou-vang"], catId["cam-nang-ve-ruou"]],
      tag_ids: [tagId["nguoi-moi-bat-dau"], tagId["bao-quan"]],
      is_featured: true,
      title: {
        "vi-VN": "Nhiệt độ phục vụ: thứ rẻ nhất để chai rượu ngon hơn",
        "en-US": "Serving temperature: the cheapest way to make any bottle taste better",
      },
      excerpt: {
        "vi-VN":
          "Cùng một chai, lệch 6°C là ra hai thứ rượu khác nhau. Bảng nhiệt độ phục vụ và cách áp dụng trong khí hậu Việt Nam.",
        "en-US":
          "The same bottle at two temperatures is effectively two different wines. A practical serving chart for Vietnam's climate.",
      },
      content: {
        "vi-VN": `Không cần đổi sang chai đắt hơn. Chỉ cần rót ở đúng nhiệt độ.

## Bảng nhiệt độ phục vụ

| Loại rượu | Nhiệt độ |
| --- | --- |
| Champagne, vang nổ | 6 – 8°C |
| Vang trắng nhẹ (Sauvignon Blanc, Pinot Grigio) | 8 – 10°C |
| Vang trắng đậm (Chardonnay ủ thùng) | 10 – 12°C |
| Vang hồng | 8 – 10°C |
| Vang đỏ nhẹ (Pinot Noir, Beaujolais) | 13 – 15°C |
| Vang đỏ đậm (Bordeaux, Barolo, Cabernet) | 16 – 18°C |
| Vang ngọt | 6 – 8°C |

## Vì sao ở Việt Nam hay sai

"Nhiệt độ phòng" trong sách rượu là **nhiệt độ phòng châu Âu**: khoảng 18°C. Phòng khách ở Hà Nội hay TP.HCM thường 27 – 30°C. Rót vang đỏ ở nhiệt độ đó thì cồn bốc lên trước, hương quả biến mất, và rượu có vị nóng ở cuống họng.

**Cách chữa nhanh:** bỏ chai vang đỏ vào ngăn mát 20 phút trước khi rót. Không lâu hơn — lạnh quá thì tannin trở nên khô và chát gắt.

Với vang trắng và champagne thì ngược lại: đừng rót ngay khi vừa lấy khỏi tủ 4°C. Để ngoài 5 – 10 phút, hương sẽ mở ra.

## Xô đá đúng cách

Nước đá **và** nước lạnh, không phải chỉ đá. Đá khô chỉ chạm được vài điểm trên vỏ chai; hỗn hợp nước–đá bọc kín toàn bộ thân chai và làm lạnh nhanh gấp đôi. Thêm một nắm muối nếu cần gấp.

## Một mẹo nhỏ

Nhiệt độ trong ly tăng khoảng 1°C sau mỗi 5 phút ở phòng máy lạnh, và nhanh hơn nhiều ở ngoài trời. Rót lạnh hơn mong muốn 2°C, rượu sẽ đi qua đúng khoảng nhiệt độ đẹp nhất trong lúc bạn uống.`,
        "en-US": `You don't need a more expensive bottle. You need the right temperature.

## Serving chart

| Style | Temperature |
| --- | --- |
| Champagne, sparkling | 6 – 8°C |
| Light white (Sauvignon Blanc, Pinot Grigio) | 8 – 10°C |
| Full white (oaked Chardonnay) | 10 – 12°C |
| Rosé | 8 – 10°C |
| Light red (Pinot Noir, Beaujolais) | 13 – 15°C |
| Full red (Bordeaux, Barolo, Cabernet) | 16 – 18°C |
| Sweet wine | 6 – 8°C |

## Why it goes wrong in Vietnam

"Room temperature" in wine books means **European** room temperature — around 18°C. A living room in Hanoi or Ho Chi Minh City sits at 27 – 30°C. Pour a red at that temperature and the alcohol dominates, the fruit disappears, and the finish burns.

**Quick fix:** twenty minutes in the fridge before serving a red. No longer — too cold and the tannins turn dry and harsh.

Whites and Champagne need the opposite treatment: don't pour straight from a 4°C fridge. Give the bottle five to ten minutes and the aromatics will open up.

## Use the ice bucket properly

Ice **and** water, not ice alone. Dry ice cubes only touch the bottle at a few points; a water–ice slurry wraps the whole bottle and chills roughly twice as fast. Add a handful of salt if you're in a hurry.

## One last trick

Wine in the glass warms about 1°C every five minutes in air conditioning, and much faster outdoors. Pour 2°C cooler than your target and the wine will pass through its best window while you drink it.`,
      },
      seo_title: {
        "vi-VN": "Nhiệt độ phục vụ rượu vang chuẩn — bảng tra nhanh | Red Apron",
        "en-US": "Wine serving temperature chart | Red Apron",
      },
      seo_description: {
        "vi-VN":
          "Bảng nhiệt độ phục vụ cho champagne, vang trắng, vang hồng, vang đỏ và vang ngọt, kèm cách áp dụng trong khí hậu nóng ẩm Việt Nam.",
        "en-US":
          "Serving temperatures for Champagne, white, rosé, red and sweet wines, adapted for Vietnam's hot and humid climate.",
      },
    },
    {
      slug: "ruou-vang-va-mon-viet",
      thumbnail:
        "https://cdn.hstatic.net/themes/200000692767/1001465560/14/section_bannerCus_img_3.jpg?v=642",
      category_ids: [catId["ket-hop-ruou-vang-am-thuc"]],
      tag_ids: [tagId["am-thuc-viet"], tagId["nguoi-moi-bat-dau"]],
      is_featured: true,
      title: {
        "vi-VN": "Rượu vang đi với món Việt: bảy cặp đôi đáng thử",
        "en-US": "Wine with Vietnamese food: seven pairings worth trying",
      },
      excerpt: {
        "vi-VN":
          "Nước mắm, rau thơm và ớt không phải kẻ thù của rượu vang. Vấn đề chỉ nằm ở chỗ chọn sai chai.",
        "en-US":
          "Fish sauce, herbs and chilli are not the enemies of wine. The problem is only ever the wrong bottle.",
      },
      content: {
        "vi-VN": `Món Việt có ba thứ khiến nhiều chai rượu "gãy": **vị mặn của nước mắm**, **rau thơm sống** và **độ cay**. Cả ba đều xử lý được.

## Nguyên tắc chung

- **Cay thì giảm cồn.** Cồn khuếch đại cảm giác cay. Chai 12,5% dễ chịu hơn hẳn chai 15% khi ăn lẩu Thái hay bún bò.
- **Mặn thì thêm axit.** Rượu có độ chua cao rửa sạch vị mặn của nước mắm. Sauvignon Blanc, Riesling khô, Champagne đều làm tốt việc này.
- **Rau thơm hợp với vang xanh.** Sauvignon Blanc vùng Loire hoặc New Zealand có sẵn nốt cỏ, bạc hà, ớt chuông — cùng họ hương với húng quế, tía tô, ngò gai.

## Bảy cặp đôi

**1. Gỏi cuốn tôm thịt — Sauvignon Blanc (Loire hoặc Marlborough).** Độ chua cắt béo của tương đen, nốt thảo mộc bắt đúng rau sống.

**2. Phở bò — Pinot Noir nhẹ, phục vụ mát 14°C.** Tannin thấp không đánh nhau với nước dùng; nốt quả đỏ hợp với quế hồi.

**3. Bánh xèo — Champagne hoặc vang nổ khô.** Bọt khí và độ chua làm sạch dầu chiên. Đây là cặp đôi ít người thử nhất mà lại hiệu quả nhất.

**4. Cá kho tộ — Chardonnay ủ thùng nhẹ, hoặc vang đỏ Grenache.** Vị ngọt caramel của nước kho cần một chai có độ đầy tương xứng.

**5. Bún chả — Riesling bán khô (off-dry).** Chút đường sót lại trong rượu cân đúng vị chua ngọt của nước chấm.

**6. Bò lúc lắc, bít tết kiểu Việt — Bordeaux bờ trái hoặc Cabernet Sauvignon.** Đây là chỗ vang đỏ đậm phát huy đúng vai trò.

**7. Chè, bánh ngọt — vang ngọt Sauternes hoặc Moscato.** Quy tắc bất di bất dịch: **rượu phải ngọt hơn món tráng miệng**, nếu không rượu sẽ có vị chua loét.

## Một điều nên bỏ

Đừng cố ép một chai vang đỏ đậm, nhiều tannin vào mâm cơm có nước mắm. Tannin gặp muối sẽ trở nên kim loại và đắng. Đó không phải lỗi của món ăn.`,
        "en-US": `Vietnamese food has three things that break a lot of bottles: **the salt of fish sauce**, **raw herbs** and **chilli heat**. All three are manageable.

## The rules

- **Heat means less alcohol.** Alcohol amplifies capsaicin. A 12.5% wine is far more comfortable than a 15% one alongside a hotpot or bún bò.
- **Salt means more acid.** High-acid wines rinse away the salinity of fish sauce. Sauvignon Blanc, dry Riesling and Champagne all do this well.
- **Herbs love green wines.** Loire or New Zealand Sauvignon Blanc carries grass, mint and bell pepper notes — the same aromatic family as Thai basil, perilla and sawtooth herb.

## Seven pairings

**1. Fresh spring rolls — Sauvignon Blanc (Loire or Marlborough).** Acidity cuts the hoisin dip; herbal notes meet the raw herbs.

**2. Phở — light Pinot Noir, served cool at 14°C.** Low tannin doesn't fight the broth; red fruit meets cinnamon and star anise.

**3. Bánh xèo — Champagne or dry sparkling.** Bubbles and acid scrub away the frying oil. The least-attempted pairing here, and the most effective.

**4. Caramelised clay-pot fish — lightly oaked Chardonnay, or a Grenache-based red.** The caramel sweetness needs a wine with matching weight.

**5. Bún chả — off-dry Riesling.** The residual sugar balances the sweet-sour dipping sauce exactly.

**6. Shaking beef, Vietnamese-style steak — Left Bank Bordeaux or Cabernet Sauvignon.** This is where a full-bodied red belongs.

**7. Sweet soups and pastries — Sauternes or Moscato.** One unbreakable rule: **the wine must be sweeter than the dessert**, or it will taste sour.

## One thing to skip

Don't force a big, tannic red onto a table with fish sauce. Tannin plus salt turns metallic and bitter. That is not the food's fault.`,
      },
      seo_title: {
        "vi-VN": "Rượu vang kết hợp món Việt — 7 cặp đôi đáng thử | Red Apron",
        "en-US": "Wine pairing with Vietnamese food — 7 combinations | Red Apron",
      },
      seo_description: {
        "vi-VN":
          "Gỏi cuốn, phở, bánh xèo, bún chả, cá kho — chọn chai nào cho vừa? Nguyên tắc kết hợp và bảy cặp đôi cụ thể.",
        "en-US":
          "Spring rolls, phở, bánh xèo, bún chả, clay-pot fish — which bottle works? Pairing principles and seven concrete matches.",
      },
    },
    {
      slug: "doc-nhan-chai-bordeaux",
      thumbnail:
        "https://cdn.hstatic.net/themes/200000692767/1001465560/14/section_bannerCus_img_4.jpg?v=642",
      category_ids: [catId["kien-thuc-ruou-vang"], catId["vung-ruou-vang"]],
      tag_ids: [tagId["bordeaux"], tagId["nguoi-moi-bat-dau"]],
      title: {
        "vi-VN": "Đọc nhãn chai Bordeaux trong hai phút",
        "en-US": "Read a Bordeaux label in two minutes",
      },
      excerpt: {
        "vi-VN":
          "Grand Cru Classé, Bờ trái hay Bờ phải, Château hay Second Wine — những chữ trên nhãn nói gì về chai rượu trong tay bạn.",
        "en-US":
          "Grand Cru Classé, Left Bank or Right Bank, Château or second wine — what the label actually tells you.",
      },
      content: {
        "vi-VN": `Nhãn Bordeaux trông rối, nhưng chỉ có bốn thông tin thật sự đáng đọc.

## 1. Tên vùng (appellation) — dòng quan trọng nhất

Dòng ghi *Appellation ... Contrôlée* cho biết rượu đến từ đâu, và vùng càng hẹp thì quy định càng chặt:

- **Bordeaux AOC** — cả vùng, rộng nhất, dễ tính nhất
- **Médoc / Haut-Médoc** — hẹp hơn
- **Pauillac · Margaux · Saint-Julien · Saint-Estèphe** — làng cụ thể, chặt nhất

Cùng một nhà sản xuất, chai ghi tên làng gần như luôn nghiêm túc hơn chai ghi "Bordeaux".

## 2. Bờ trái hay bờ phải

Sông Gironde chia Bordeaux làm hai, và hai bên trồng nho khác nhau:

- **Bờ trái** (Médoc, Graves, Pessac-Léognan): chủ đạo **Cabernet Sauvignon** — tannin chắc, nốt chì than, cần thời gian.
- **Bờ phải** (Saint-Émilion, Pomerol): chủ đạo **Merlot** — mềm hơn, quả chín hơn, uống sớm được.

Người mới thường thấy bờ phải dễ tiếp cận hơn.

## 3. "Grand Cru Classé" nghĩa là gì

Đây là chỗ dễ nhầm nhất, vì **hai bờ dùng hai hệ xếp hạng khác nhau**:

- Bờ trái theo bảng phân hạng **1855**, chia năm bậc (1er đến 5ème Cru Classé). Bảng này gần như không đổi trong 170 năm.
- Saint-Émilion có bảng riêng, **xét lại khoảng mười năm một lần** — nên "Grand Cru Classé" của Saint-Émilion là danh hiệu đang được kiểm tra liên tục, không phải danh hiệu vĩnh viễn.

Còn *"Saint-Émilion Grand Cru"* (không có chữ **Classé**) chỉ là một appellation với quy định thu hoạch chặt hơn — **không** phải xếp hạng chất lượng. Một chữ, hai thứ hoàn toàn khác nhau.

## 4. Rượu thứ hai (second wine)

Nhiều château nổi tiếng bán thêm dòng thứ hai từ những lô nho trẻ hơn: *Amiral de Beychevelle* của Château Beychevelle, *Le Merle Blanc* của Château Clarke. Cùng đội ngũ, cùng triết lý, giá thường bằng một phần ba — đây là cách hợp lý nhất để làm quen với phong cách của một château lớn.

## Còn niên vụ?

Có ảnh hưởng, nhưng ít hơn người ta tưởng với rượu ngày nay: kỹ thuật canh tác và chọn lọc đã thu hẹp khoảng cách giữa năm tốt và năm xấu. Đọc bốn mục ở trên trước, niên vụ để sau cùng.`,
        "en-US": `Bordeaux labels look dense, but only four things really matter.

## 1. The appellation — the most important line

The line reading *Appellation ... Contrôlée* tells you where the wine comes from, and the narrower the area, the stricter the rules:

- **Bordeaux AOC** — the whole region, broadest, most permissive
- **Médoc / Haut-Médoc** — narrower
- **Pauillac · Margaux · Saint-Julien · Saint-Estèphe** — a specific commune, strictest

From the same producer, a bottle naming a commune is almost always the more serious wine.

## 2. Left Bank or Right Bank

The Gironde splits Bordeaux in two, and each side plants differently:

- **Left Bank** (Médoc, Graves, Pessac-Léognan): **Cabernet Sauvignon** led — firm tannin, graphite notes, needs time.
- **Right Bank** (Saint-Émilion, Pomerol): **Merlot** led — softer, riper fruit, drinkable earlier.

Newcomers usually find the Right Bank easier to approach.

## 3. What "Grand Cru Classé" means

This is where most confusion lives, because **the two banks use different classifications**:

- The Left Bank follows the **1855 classification**, five tiers (1er to 5ème Cru Classé). It has barely changed in 170 years.
- Saint-Émilion runs its own list, **revised roughly every ten years** — so its "Grand Cru Classé" is a title under continuous review, not a permanent one.

Meanwhile *"Saint-Émilion Grand Cru"* — without **Classé** — is merely an appellation with stricter yield rules. It is **not** a quality ranking. One word, two entirely different things.

## 4. Second wines

Many famous châteaux release a second label from younger parcels: *Amiral de Beychevelle* from Château Beychevelle, *Le Merle Blanc* from Château Clarke. Same team, same philosophy, often a third of the price — the most sensible way to get to know a great estate's style.

## What about the vintage?

It matters, but less than people assume with modern wine: viticulture and selection have narrowed the gap between good and difficult years. Read the four points above first; check the vintage last.`,
      },
      seo_title: {
        "vi-VN": "Cách đọc nhãn chai rượu vang Bordeaux | Red Apron",
        "en-US": "How to read a Bordeaux wine label | Red Apron",
      },
      seo_description: {
        "vi-VN":
          "Appellation, Bờ trái – Bờ phải, Grand Cru Classé và rượu thứ hai: bốn thông tin cần đọc trên nhãn chai Bordeaux.",
        "en-US":
          "Appellation, Left and Right Bank, Grand Cru Classé and second wines: the four things to read on a Bordeaux label.",
      },
    },
    {
      slug: "bao-quan-ruou-vang-o-viet-nam",
      thumbnail:
        "https://cdn.hstatic.net/themes/200000692767/1001465560/14/section_bannerCus_img_5.jpg?v=642",
      category_ids: [catId["cam-nang-ve-ruou"]],
      tag_ids: [tagId["bao-quan"]],
      title: {
        "vi-VN": "Bảo quản rượu vang trong khí hậu nóng ẩm",
        "en-US": "Storing wine in a hot, humid climate",
      },
      excerpt: {
        "vi-VN":
          "Kẻ giết rượu ở Việt Nam không phải nhiệt độ cao, mà là nhiệt độ dao động. Cách xử lý khi chưa có tủ chuyên dụng.",
        "en-US":
          "What kills wine in Vietnam isn't heat — it's temperature swing. What to do before you own a wine fridge.",
      },
      content: {
        "vi-VN": `Nhiều người nghĩ rượu hỏng vì nóng. Thật ra rượu hỏng vì **thay đổi nhiệt độ liên tục**: mỗi lần nóng lên rồi nguội đi, rượu trong chai giãn nở rồi co lại, đẩy không khí qua nút bần. Vài chục chu kỳ như vậy là chai bị oxy hoá.

Một chai để yên ở 24°C ổn định sẽ sống lâu hơn một chai dao động 20 – 30°C mỗi ngày.

## Bốn điều kiện, theo thứ tự quan trọng

1. **Nhiệt độ ổn định** — quan trọng hơn nhiệt độ thấp. Lý tưởng 12 – 14°C; nhưng 22°C không đổi vẫn tốt hơn 18 – 28°C dao động.
2. **Tránh ánh sáng** — tia UV phá cấu trúc rượu. Đây là lý do chai vang đỏ có màu xanh đậm. Vang hồng và vang nổ đựng trong chai trong suốt nhạy cảm hơn hẳn.
3. **Nằm ngang** — với chai nút bần, để nút luôn tiếp xúc rượu, không bị khô và co lại. Chai nút vặn thì để đứng cũng được.
4. **Độ ẩm 60 – 80%** — thấp quá thì nút khô. Ở Việt Nam độ ẩm hiếm khi là vấn đề; đôi khi còn ngược lại, ẩm quá làm mốc nhãn (mốc nhãn không ảnh hưởng rượu bên trong).

## Những chỗ KHÔNG nên để

- **Trên nóc tủ lạnh** — nóng và rung, hai thứ tệ nhất cùng lúc
- **Gần bếp hoặc lò nướng**
- **Cạnh cửa sổ hướng tây**
- **Trong tủ lạnh gia đình dài ngày** — quá lạnh, quá khô, và rung liên tục từ máy nén

## Chưa có tủ rượu thì làm gì

Chỗ tốt nhất trong hầu hết căn hộ Việt Nam là **ngăn dưới cùng của tủ quần áo ở phòng có máy lạnh**, hoặc gầm cầu thang khuất sáng. Tối, kín gió, nhiệt độ đổi chậm.

Nếu chỉ giữ vài tuần trước khi uống thì không cần lo nhiều. Chuyện bảo quản chỉ thật sự quan trọng khi bạn định giữ chai qua nhiều tháng, hoặc chai đó đáng để giữ.

## Khi nào nên đầu tư tủ rượu

Khi bạn thường xuyên có trên 12 chai trong nhà, hoặc có chai định để trên một năm. Dưới ngưỡng đó, một góc tối và mát là đủ.`,
        "en-US": `Most people assume heat ruins wine. In fact what ruins it is **temperature swing**: every warming and cooling cycle expands and contracts the liquid, pushing air past the cork. A few dozen cycles and the bottle is oxidised.

A bottle sitting steadily at 24°C will outlive one swinging between 20 and 30°C every day.

## Four conditions, in order of importance

1. **Stable temperature** — more important than low temperature. Ideal is 12 – 14°C, but a constant 22°C beats a fluctuating 18 – 28°C.
2. **Away from light** — UV breaks wine down. That's why red wine bottles are dark green. Rosé and sparkling wine in clear glass are far more vulnerable.
3. **Lying flat** — for corked bottles, so the cork stays wet and doesn't shrink. Screwcaps can stand upright.
4. **Humidity 60 – 80%** — too dry and the cork fails. In Vietnam humidity is rarely the problem; if anything it's the reverse, and labels grow mould (which doesn't affect the wine inside).

## Places NOT to store wine

- **On top of the refrigerator** — heat and vibration, the two worst factors at once
- **Near a stove or oven**
- **Beside a west-facing window**
- **In the household fridge long term** — too cold, too dry, and constantly vibrating

## Before you own a wine fridge

In most Vietnamese apartments the best spot is **the bottom shelf of a wardrobe in an air-conditioned room**, or a dark space under the stairs. Dark, still, slow to change temperature.

If you're only keeping a bottle a few weeks before drinking it, none of this matters much. Storage becomes real when you intend to hold bottles for months — or when the bottle is worth holding.

## When to buy a wine cabinet

When you routinely keep more than a dozen bottles at home, or own something you plan to cellar past a year. Below that, a cool dark corner is enough.`,
      },
      seo_title: {
        "vi-VN": "Bảo quản rượu vang đúng cách ở Việt Nam | Red Apron",
        "en-US": "How to store wine in Vietnam's climate | Red Apron",
      },
      seo_description: {
        "vi-VN":
          "Nhiệt độ, ánh sáng, tư thế chai và độ ẩm — bốn điều kiện bảo quản rượu vang, và cách xoay xở khi chưa có tủ rượu chuyên dụng.",
        "en-US":
          "Temperature, light, bottle position and humidity — the four storage conditions, and what to do before you own a wine fridge.",
      },
    },
  ]

  let daTao = 0
  for (const p of posts) {
    const [daCo] = await service.listBlogPosts({ slug: p.slug })
    if (daCo) {
      logger.info(`  · Bỏ qua "${p.slug}" (đã có, không ghi đè)`)
      continue
    }
    await service.createBlogPosts([
      {
        slug: p.slug,
        status: "published" as const,
        published_at: new Date(),
        thumbnail: p.thumbnail,
        author_id: author.id,
        category_ids: p.category_ids.filter(Boolean),
        tag_ids: p.tag_ids.filter(Boolean),
        is_featured: !!p.is_featured,
        title: p.title,
        excerpt: p.excerpt,
        content: p.content,
        seo_title: p.seo_title,
        seo_description: p.seo_description,
      },
    ] as any)
    daTao++
    logger.info(`  ✔ Bài "${p.slug}"`)
  }

  logger.info("═".repeat(60))
  logger.info(
    ` Blog Red Apron: ${catDefs.length} danh mục · ${tagDefs.length} thẻ · ${daTao} bài mới`
  )
  logger.info(" Viết bài tiếp ở Admin → Blog (http://localhost:5773)")
  logger.info("═".repeat(60))
}
