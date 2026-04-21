# syntax=docker/dockerfile:1.9

# -------- builder --------
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
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @bebe/web build

# -------- runner --------
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache gosu tini curl && \
    (delgroup node 2>/dev/null || true) && \
    (deluser node 2>/dev/null || true) && \
    addgroup -g 1000 -S bebe && \
    adduser -u 1000 -S bebe -G bebe

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public
COPY --from=builder /repo/packages/db/prisma ./packages/db/prisma
# Prisma client (generated + runtime) — pnpm symlinks are followed by COPY
COPY --from=builder /repo/packages/db/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /repo/packages/db/node_modules/@prisma ./node_modules/@prisma
# Prisma CLI for migrate deploy at runtime
COPY --from=builder /repo/packages/db/node_modules/prisma ./node_modules/prisma

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "apps/web/server.js"]
