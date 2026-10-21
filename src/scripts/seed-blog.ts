/**
 * ═══════════════════════════════════════════════════════════════════════
 *  VP Holding — Seed Blog (tác giả · danh mục · thẻ · bài viết mẫu SONG NGỮ)
 *  Chạy: (Docker) docker compose exec medusa npx medusa exec ./src/scripts/seed-blog.ts
 *        (local)  npx medusa exec ./src/scripts/seed-blog.ts
 *
 *  Idempotent: chạy lại KHÔNG tạo trùng (kiểm theo slug), KHÔNG ghi đè bài đã sửa.
 * ═══════════════════════════════════════════════════════════════════════
 */
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { BLOG_MODULE } from "../modules/blog"
import type BlogModuleService from "../modules/blog/service"

export default async function seedBlog({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service: BlogModuleService = container.resolve(BLOG_MODULE)

  logger.info("═══ Seed Blog (song ngữ vi-VN / en-US) ═══")

  // ─────────────────────────────────────────────── 1. Tác giả ──
  let [author] = await service.listBlogAuthors({})
  if (!author) {
    ;[author] = await service.createBlogAuthors([
      {
        name: "Đội ngũ VP Holding",
        bio: {
          "vi-VN":
            "Đội nội dung của VP Holding — chia sẻ về lên men, dinh dưỡng và lối sống lành.",
          "en-US":
            "The VP Holding content team — notes on fermentation, nutrition and healthy living.",
        },
        avatar: null,
      },
    ])
    logger.info(`  ✔ Tác giả "${author.name}"`)
  }

  // ─────────────────────────────────────────────── 2. Danh mục ──
  const catDefs = [
    { slug: "cong-thuc", rank: 1, name: { "vi-VN": "Công thức", "en-US": "Recipes" } },
    { slug: "meo-bao-quan", rank: 2, name: { "vi-VN": "Mẹo bảo quản", "en-US": "Storage tips" } },
    { slug: "cau-chuyen", rank: 3, name: { "vi-VN": "Câu chuyện sản phẩm", "en-US": "Our stories" } },
  ]
  const catIdBySlug: Record<string, string> = {}
  for (const c of catDefs) {
    let [cat] = await service.listBlogCategories({ slug: c.slug })
    if (!cat) {
      ;[cat] = await service.createBlogCategories([
        { slug: c.slug, rank: c.rank, name: c.name, description: null },
      ])
      logger.info(`  ✔ Danh mục "${c.slug}"`)
    }
    catIdBySlug[c.slug] = cat.id
  }

  // ─────────────────────────────────────────────── 3. Thẻ ──
  const tagDefs = [
    { slug: "len-men", name: { "vi-VN": "Lên men", "en-US": "Fermentation" } },
    { slug: "suc-khoe", name: { "vi-VN": "Sức khoẻ", "en-US": "Health" } },
  ]
  const tagIdBySlug: Record<string, string> = {}
  for (const t of tagDefs) {
    let [tag] = await service.listBlogTags({ slug: t.slug })
    if (!tag) {
      ;[tag] = await service.createBlogTags([{ slug: t.slug, name: t.name }])
      logger.info(`  ✔ Thẻ "${t.slug}"`)
    }
    tagIdBySlug[t.slug] = tag.id
  }

  // ─────────────────────────────────────────────── 4. Bài viết ──
  const posts: Array<{
    slug: string
    thumbnail: string | null
    category_ids: string[]
    tag_ids: string[]
    is_featured?: boolean
    title: Record<string, string>
    excerpt: Record<string, string>
    content: Record<string, string>
    seo_title?: Record<string, string>
    seo_description?: Record<string, string>
  }> = [
    {
      slug: "loi-ich-rau-cu-len-men",
      thumbnail: null,
      category_ids: [catIdBySlug["cau-chuyen"], catIdBySlug["cong-thuc"]].filter(Boolean),
      tag_ids: [tagIdBySlug["len-men"], tagIdBySlug["suc-khoe"]].filter(Boolean),
      is_featured: true,
      title: {
        "vi-VN": "5 lợi ích của rau củ lên men bạn nên biết",
        "en-US": "5 benefits of fermented vegetables you should know",
      },
      excerpt: {
        "vi-VN": "Lên men không chỉ giúp bảo quản — nó còn làm giàu lợi khuẩn và dưỡng chất cho món ăn hằng ngày.",
        "en-US": "Fermentation is more than preservation — it enriches your everyday food with probiotics and nutrients.",
      },
      content: {
        "vi-VN":
          "## Vì sao nên ăn rau củ lên men?\n\nRau củ lên men tự nhiên là nguồn **lợi khuẩn** dồi dào, hỗ trợ tiêu hoá và tăng sức đề kháng.\n\n1. Bổ sung men vi sinh sống\n2. Giữ được vitamin qua thời gian\n3. Dễ hấp thu hơn rau sống\n4. Hương vị đậm đà tự nhiên\n5. Không cần chất bảo quản\n\n> Mỗi mẻ của chúng tôi được ủ trong điều kiện kiểm soát, theo dõi từng ngày.",
        "en-US":
          "## Why eat fermented vegetables?\n\nNaturally fermented vegetables are rich in **probiotics** that support digestion and immunity.\n\n1. Live cultures for your gut\n2. Vitamins preserved over time\n3. Easier to absorb than raw\n4. Deep, natural flavour\n5. No preservatives needed\n\n> Every batch of ours is fermented under controlled conditions, monitored day by day.",
      },
    },
    {
      slug: "cach-bao-quan-do-len-men",
      thumbnail: null,
      category_ids: [catIdBySlug["meo-bao-quan"]].filter(Boolean),
      tag_ids: [tagIdBySlug["len-men"]].filter(Boolean),
      title: {
        "vi-VN": "Cách bảo quản đồ lên men đúng cách",
        "en-US": "How to store fermented foods the right way",
      },
      excerpt: {
        "vi-VN": "Nhiệt độ và ánh sáng quyết định hương vị. Vài nguyên tắc đơn giản giúp giữ hũ lên men ngon lâu.",
        "en-US": "Temperature and light shape the flavour. A few simple rules keep your ferments tasting great for longer.",
      },
      content: {
        "vi-VN":
          "## Giữ lạnh sau khi mở\n\nSau khi đạt độ chua mong muốn, hãy chuyển hũ vào ngăn mát để **làm chậm quá trình lên men**.\n\n- Luôn dùng dụng cụ sạch khi gắp\n- Nén rau ngập dưới nước muối\n- Tránh ánh nắng trực tiếp\n\nBảo quản đúng cách, sản phẩm giữ được vị ngon trong nhiều tuần.",
        "en-US":
          "## Refrigerate after opening\n\nOnce it reaches the sourness you like, move the jar to the fridge to **slow the fermentation**.\n\n- Always use clean utensils\n- Keep vegetables submerged under the brine\n- Avoid direct sunlight\n\nStored well, the product keeps its flavour for weeks.",
      },
    },
    {
      slug: "cong-thuc-kim-chi-cai-thao",
      thumbnail: null,
      category_ids: [catIdBySlug["cong-thuc"]].filter(Boolean),
      tag_ids: [tagIdBySlug["len-men"], tagIdBySlug["suc-khoe"]].filter(Boolean),
      title: {
        "vi-VN": "Công thức kim chi cải thảo tại nhà",
        "en-US": "Homemade napa cabbage kimchi recipe",
      },
      excerpt: {
        "vi-VN": "Một công thức kim chi cân bằng, dễ làm, hợp khẩu vị người Việt — lên men tự nhiên trong 2–3 ngày.",
        "en-US": "A balanced, easy kimchi recipe suited to Vietnamese taste — naturally fermented in 2–3 days.",
      },
      content: {
        "vi-VN":
          "## Nguyên liệu\n\n- 1 bắp cải thảo\n- Muối biển\n- Ớt bột Hàn, tỏi, gừng\n- Nước mắm\n\n## Cách làm\n\n1. Xát muối cải thảo, để 2 giờ cho ra nước\n2. Rửa sạch, trộn với hỗn hợp gia vị\n3. Cho vào hũ, nén chặt\n4. Ủ ở nhiệt độ phòng 2–3 ngày rồi cho vào tủ lạnh\n\nChúc bạn thành công!",
        "en-US":
          "## Ingredients\n\n- 1 napa cabbage\n- Sea salt\n- Korean chilli flakes, garlic, ginger\n- Fish sauce\n\n## Steps\n\n1. Salt the cabbage, rest 2 hours to draw out water\n2. Rinse, mix with the spice paste\n3. Pack tightly into a jar\n4. Ferment at room temperature 2–3 days, then refrigerate\n\nEnjoy!",
      },
    },
  ]

  for (const p of posts) {
    const existing = await service.listBlogPosts({ slug: p.slug })
    if (existing.length) {
      logger.info(`  · Bài "${p.slug}" đã có — bỏ qua`)
      continue
    }
    await service.createBlogPosts([
      {
        slug: p.slug,
        status: "published",
        published_at: new Date(),
        thumbnail: p.thumbnail,
        author_id: author.id,
        category_ids: p.category_ids,
        tag_ids: p.tag_ids,
        is_featured: p.is_featured ?? false,
        title: p.title,
        excerpt: p.excerpt,
        content: p.content,
        seo_title: p.seo_title ?? null,
        seo_description: p.seo_description ?? p.excerpt,
      },
    ] as any)
    logger.info(`  ✔ Bài "${p.slug}"`)
  }

  logger.info("═══════════════════════════════════════════")
  logger.info(`  Xong. Bài mẫu đã đăng.`)
  logger.info(`  Sửa/soạn tiếp: Admin → Blog`)
  logger.info(`  Storefront đọc qua: GET /store/blog/posts`)
  logger.info("═══════════════════════════════════════════")
}
