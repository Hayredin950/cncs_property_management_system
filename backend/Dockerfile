FROM node:22-alpine

ENV CI=true

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 4000

CMD ["pnpm", "run", "dev"]