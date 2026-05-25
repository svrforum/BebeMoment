# syntax=docker/dockerfile:1.9

# -------- builder --------
# Debian-based: Prisma's Alpine binary detection has been flaky on
# 3.20+ (looks for libssl.so.1.1 even when 3.0 is asked for). Bookworm
# has OpenSSL 3 and Prisma's `debian-openssl-3.0.x` target Just Works.
FROM node:20-bookworm-slim AS builder
WORKDIR /repo
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json ./
COPY apps/web/package.json apps/web/
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
# Next 15.5 throws ENOENT when stat'ing a missing apps/web/.env at build
# time. We don't ship env files in the image (runtime injects via docker
# run / compose env_file), so an empty placeholder unblocks the build.
RUN touch apps/web/.env
ENV NEXT_TELEMETRY_DISABLED=1
# `next.config.mjs` rewrites are evaluated at build time and inlined into
# the routes manifest. Without this, the proxy from `/media/*` to the
# media service is lost and the browser hits web on port 3000 for SSE +
# signed URLs and gets a 404. The default works for our local docker
# (host network mapping). Override per-deployment with
# `--build-arg MEDIA_INTERNAL_URL=http://media:3001` for compose.
ARG MEDIA_INTERNAL_URL=http://localhost:3001
ENV MEDIA_INTERNAL_URL=$MEDIA_INTERNAL_URL
RUN pnpm --filter @bebe/web build

# -------- runner --------
# Standalone output requires a full `next build` (not compile-only), and
# the Next 15.5 prerender regression keeps us on compile mode for now.
# So ship the full repo (built `.next` + node_modules + public) and run
# `next start` directly. Image is fatter than standalone but works.
FROM node:20-bookworm-slim AS runner
WORKDIR /repo

RUN apt-get update && apt-get install -y --no-install-recommends \
    tini curl postgresql-client openssl ca-certificates gosu \
    && rm -rf /var/lib/apt/lists/* \
    && (userdel -r node 2>/dev/null || true) \
    && (groupdel node 2>/dev/null || true) \
    && groupadd -g 1000 bebe \
    && useradd -u 1000 -g bebe -s /bin/bash -m bebe \
    && corepack enable && corepack prepare pnpm@9.12.0 --activate

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Repo with installed deps + built .next. Symlinks in pnpm node_modules
# make selective COPYing painful, so just bring the whole tree.
COPY --from=builder /repo /repo

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["pnpm", "--filter", "@bebe/web", "exec", "next", "start", "-p", "3000", "-H", "0.0.0.0"]
