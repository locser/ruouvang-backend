FROM node:20-alpine
RUN npm install -g pnpm@10.11.1 && apk add --no-cache bash
WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
EXPOSE 9000
CMD ["pnpm", "run", "dev"]
