// Medusa CLI chỉ đọc biến PORT; repo này dùng SERVICE_PORT (trong .env) cho thống nhất.
// Đổi tên trước khi nạp CLI. Dùng: node --env-file-if-exists=.env scripts/chay-medusa.cjs develop
if (process.env.SERVICE_PORT) process.env.PORT = process.env.SERVICE_PORT
require("@medusajs/cli/cli.js")
