FROM node:22-alpine

ENV CI=true

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .

# Prisma 7 dropped the automatic postinstall generate, so `pnpm install` alone leaves
# @prisma/client as a stub and the container dies at startup with "The requested module
# '@prisma/client' does not provide an export named 'PrismaClient'". It has to run here,
# after the schema is copied, and it has to run in the image: docker-compose.yaml mounts an
# anonymous volume over /app/node_modules, so a client generated on the host is masked.
# CI's docker step only builds the image and never starts it, which is why this went unseen.
#
# DIRECT_URL is a build-time placeholder, not a real credential. prisma.config.ts resolves
# env("DIRECT_URL") eagerly when the config loads and throws PrismaConfigEnvError if it is
# unset; .env lives at the repo root, outside this build context, so nothing is injected here.
# `generate` only reads schema.prisma and opens no connection, so any syntactically valid URL
# works. The real DIRECT_URL arrives at runtime from docker-compose.yaml's `env_file: .env`.
RUN DIRECT_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
    pnpm exec prisma generate

EXPOSE 4000

CMD ["pnpm", "run", "dev"]