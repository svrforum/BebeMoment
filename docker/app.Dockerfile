# syntax=docker/dockerfile:1.9

# -------- builder --------
# Debian: Prisma Alpine 바이너리 감지가 3.20+ 에서 불안정해 web 은 Debian 고정.
# media 의 sharp 는 @img/sharp-* prebuild(optionalDeps)로 설치되므로 별도 빌드 불필요.
FROM node:22-bookworm-slim AS builder
WORKDIR /repo
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.5.0 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/media/package.json apps/media/
COPY packages/config/package.json packages/config/
COPY packages/core/package.json packages/core/
COPY packages/db-public/package.json packages/db-public/
COPY packages/db-media/package.json packages/db-media/
COPY packages/media-client/package.json packages/media-client/
COPY packages/queue/package.json packages/queue/
COPY packages/storage/package.json packages/storage/

# BuildKit cache mount — pnpm store 를 빌드 간 재사용. lock 변경 없으면 install 거의 즉시.
# id 는 platform 무관 (단일 amd64 빌드). target 은 pnpm 의 글로벌 store 경로.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm config set store-dir /root/.local/share/pnpm/store && \
    pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN pnpm --filter @bebe/db-public exec prisma generate
RUN pnpm --filter @bebe/db-media exec prisma generate
# Next 15.5 는 빌드 시 누락된 apps/web/.env stat 에서 ENOENT — placeholder 로 우회.
RUN touch apps/web/.env
ENV NEXT_TELEMETRY_DISABLED=1
# next.config rewrites 는 빌드 시 routes-manifest 에 인라인된다. 단일 컨테이너에서
# media 는 같은 컨테이너 localhost:3001 이므로 기본값이 곧 맞다.
ARG MEDIA_INTERNAL_URL=http://localhost:3001
ENV MEDIA_INTERNAL_URL=$MEDIA_INTERNAL_URL
# Next 의 incremental 빌드 캐시(.next/cache) 를 빌드 간 보존 → 변경된 페이지만 컴파일.
RUN --mount=type=cache,id=next-build,target=/repo/apps/web/.next/cache \
    pnpm --filter @bebe/web build

# -------- runner --------
FROM node:22-bookworm-slim AS runner
WORKDIR /repo

# ffmpeg(영상 파이프라인) + libvips42(sharp 시스템 라이브러리) + 운영 유틸.
# postgresql-client-17: 백업 pg_dump/pg_restore 는 서버(pg17)와 major 가 같거나 높아야
# 한다. bookworm 기본은 15 라 PGDG 저장소에서 17 을 받는다. zstd: 백업 번들 압축.
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini curl openssl ca-certificates gosu bash ffmpeg libvips42 zstd gnupg \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
       -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
       > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends postgresql-client-17 \
    && apt-get purge -y gnupg && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* \
    && (userdel -r node 2>/dev/null || true) \
    && (groupdel node 2>/dev/null || true) \
    && groupadd -g 1000 bebe \
    && useradd -u 1000 -g bebe -s /bin/bash -m bebe \
    && corepack enable && corepack prepare pnpm@11.5.0 --activate

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV MEDIA_ROLE=both
ENV MEDIA_PORT=3001
# 릴리즈 태그(예: v0.0.11)를 이미지에 새긴다 — 설정·관리자 화면에 버전 표시. release.yml 이
# --build-arg APP_VERSION=<tag> 로 주입. 로컬/미지정 빌드는 'dev'.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

# 전체 트리(빌드된 .next + apps/media 소스 + node_modules + 양쪽 prisma client).
COPY --from=builder /repo /repo

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY docker/run-app.sh /usr/local/bin/run-app.sh
COPY docker/bebe-restore.sh /usr/local/bin/bebe-restore
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/run-app.sh /usr/local/bin/bebe-restore

VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=40s \
  CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["/usr/local/bin/run-app.sh"]
