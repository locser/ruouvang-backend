import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import fs from "fs"
import path from "path"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const { filename } = req.params

  const candidatePaths = [
    path.join(process.cwd(), "scraped_images", filename),
    path.join("/data/CellphoneS/data/images", filename),
    path.join("/data/FarmersMarket/data/images", filename),
    path.join("/data/CellphoneS/data", filename),
    path.join("/data", filename),
  ]

  let filePath: string | null = null
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      filePath = p
      break
    }
  }

  if (!filePath) {
    return res.status(404).send("Image not found")
  }

  const ext = path.extname(filePath).toLowerCase()
  let contentType = "image/jpeg"
  if (ext === ".png") {
    contentType = "image/png"
  } else if (ext === ".webp") {
    contentType = "image/webp"
  } else if (ext === ".gif") {
    contentType = "image/gif"
  } else if (ext === ".svg") {
    contentType = "image/svg+xml"
  }

  res.setHeader("Content-Type", contentType)
  fs.createReadStream(filePath).pipe(res)
}
