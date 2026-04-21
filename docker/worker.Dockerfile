# syntax=docker/dockerfile:1.9

FROM node:20-alpine AS builder
WORKDIR /repo
RUN apk add --no-cache libc6-compat python3 make g++
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/config/package.json packages/config/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/storage/package.json packages/storage/

RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm --filter @bebe/db exec prisma generate

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache gosu tini ffmpeg curl && \
    addgroup -g 1000 -S bebe && \
    adduser -u 1000 -S bebe -G bebe

ENV NODE_ENV=production
ENV PRISMA_SKIP_MIGRATE=1

COPY --from=builder /repo ./
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

VOLUME ["/data"]

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "--loader", "tsx/esm", "apps/worker/src/main.ts"]
