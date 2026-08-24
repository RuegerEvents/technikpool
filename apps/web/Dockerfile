# syntax=docker/dockerfile:1.7
#
# Build context is the REPO ROOT, not this directory — the build needs the
# workspace manifest and lockfile. Build with:
#   docker build -f apps/web/Dockerfile .

FROM node:24-alpine AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# Avoid git-hook install failures in container builds
ENV HUSKY=0
RUN corepack enable
RUN corepack prepare pnpm@10.29.3 --activate

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
RUN pnpm --filter web build

FROM node:24-alpine AS runner
ENV NODE_ENV=production
ENV HUSKY=0

WORKDIR /app

# pnpm links a workspace package's dependencies as symlinks into the root
# store, so both trees have to come across for anything to resolve.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

COPY --from=build /app/apps/web/build ./apps/web/build
COPY --from=build /app/apps/web/prisma ./apps/web/prisma
COPY --from=build /app/apps/web/prisma.config.ts ./apps/web/prisma.config.ts
COPY --from=build /app/apps/web/package.json ./apps/web/package.json

WORKDIR /app/apps/web

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node build/index.js"]
