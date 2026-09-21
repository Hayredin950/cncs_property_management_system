FROM node:22-alpine

ENV CI=true

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./

RUN corepack enable && corepack prepare pnpm@latest --activate

RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 5173

# Vite's dev server binds to the container's loopback by default; vite.config.ts sets
# `server.host: true` so `docker compose`'s port mapping can actually reach it — the same
# "works on my machine, not in the container" trap the backend's Dockerfile documents for
# Prisma's generate step.
CMD ["pnpm", "run", "dev"]
