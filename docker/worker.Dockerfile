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
    (delgroup node 2>/dev/null || true) && \
    (deluser node 2>/dev/null || true) && \
    addgroup -g 1000 -S bebe && \
    adduser -u 1000 -S bebe -G bebe

ENV NODE_ENV=production
ENV PRISMA_SKIP_MIGRATE=1

# Copy ONLY worker + shared packages + required node_modules
COPY --from=builder /repo/apps/worker/ ./apps/worker/
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/package.json ./
COPY --from=builder /repo/pnpm-workspace.yaml ./
COPY --from=builder /repo/tsconfig.base.json ./

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Remove web app (not needed in worker runtime)
RUN rm -rf apps/web

VOLUME ["/data"]
HEALTHCHECK --interval=60s --timeout=10s --retries=3 --start-period=30s \
  CMD pgrep -f 'apps/worker' > /dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "--loader", "tsx/esm", "apps/worker/src/main.ts"]
