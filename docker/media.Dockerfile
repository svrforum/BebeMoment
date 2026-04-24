# syntax=docker/dockerfile:1.9

FROM node:20-alpine AS builder
WORKDIR /repo
RUN apk add --no-cache libc6-compat python3 make g++ vips-dev
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY apps/media/package.json apps/media/
COPY packages/config/package.json packages/config/
COPY packages/core/package.json packages/core/
COPY packages/db-public/package.json packages/db-public/
COPY packages/db-media/package.json packages/db-media/
COPY packages/media-client/package.json packages/media-client/
COPY packages/storage/package.json packages/storage/

RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm --filter @bebe/db-public exec prisma generate
RUN pnpm --filter @bebe/db-media exec prisma generate

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache gosu tini ffmpeg vips curl postgresql-client wget && \
    (delgroup node 2>/dev/null || true) && \
    (deluser node 2>/dev/null || true) && \
    addgroup -g 1000 -S bebe && \
    adduser -u 1000 -S bebe -G bebe

ENV NODE_ENV=production
ENV PRISMA_SKIP_MIGRATE=1
ENV MEDIA_ROLE=both
ENV MEDIA_PORT=3001

COPY --from=builder /repo/apps/media/ ./apps/media/
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/package.json ./
COPY --from=builder /repo/pnpm-workspace.yaml ./
COPY --from=builder /repo/tsconfig.base.json ./

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Remove web + worker (not needed in media runtime)
RUN rm -rf apps/web apps/worker

VOLUME ["/data"]
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=30s \
  CMD wget -qO- http://localhost:3001/media/v1/health || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "--loader", "tsx/esm", "apps/media/src/main.ts"]
