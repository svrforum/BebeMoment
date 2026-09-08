# syntax=docker/dockerfile:1.9

# -------- builder --------
# Debian: Prisma Alpine 바이너리 감지가 3.20+ 에서 불안정해 web 은 Debian 고정.
# 네이티브 툴체인(python3/make/g++)은 없다 — install 이 --ignore-scripts 라 아무것도 컴파일하지
# 않고, sharp 는 @img/sharp-* prebuild(optionalDeps), bcryptjs 는 순수 JS 다.
FROM node:22-bookworm-slim AS builder
WORKDIR /repo
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.5.0 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/media/package.json apps/media/
# e2e 도 워크스페이스 멤버다. 빼고 설치하면 peer 컨텍스트가 lockfile 과 달라져 next 가
# 두 벌(각 170MB) 해석된다. 이미지에는 아래 prune 이 e2e 의존성을 다시 걷어낸다.
COPY e2e/package.json e2e/
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

# 런타임 트리로 줄인다. `pnpm install --prod` 가 같은 store 에서 프로덕션 의존성만 다시 링크한다
# (devDependencies: playwright·testcontainers·vitest·biome·typescript… 제거). `pnpm prune --prod`
# 는 워크스페이스에서 루트만 보고 다른 패키지의 node_modules 링크를 전부 지워 버려 못 쓴다.
# CI=true: 설정이 바뀐 modules 디렉터리 재생성 확인을 TTY 없이 통과시킨다.
# pnpm 은 제거된 devDependency 의 optionalDependencies(biome CLI 바이너리, e2e 의 옛 sharp 등
# 110MB)를 store 에 남긴다 — prune-store.mjs 가 어느 패키지에서도 닿지 않는 store 디렉터리를 지운다.
# 그 뒤 런타임이 읽지 않는 것 둘을 더 걷어낸다:
#   - .next/server 의 소스맵 — next start 는 소스맵을 켜지 않는다(스택 트레이스는 지금도 청크 기준)
#   - @next/swc — next build/dev 전용 네이티브 바이너리(125MB), next start 는 로드하지 않는다
#   - typescript — prisma 의 optional peer. migrate deploy 는 없이도 돈다(오프라인 부팅으로 확인)
# ⚠️ @prisma/dev·@prisma/studio-core·pglite 는 prisma CLI 가 시작하자마자 require 한다 —
#    지우면 migrate deploy 가 MODULE_NOT_FOUND 로 죽는다(직접 확인). 100MB 지만 그대로 둔다.
# .next/cache 는 런타임에 Next 가 unstable_cache 항목을 쓰는 곳 — 비워 두되 존재해야 한다.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    CI=true pnpm install --prod --frozen-lockfile --ignore-scripts --offline \
    && node docker/prune-store.mjs \
    && rm -rf apps/web/.next/cache e2e \
    && find apps/web/.next/server -name '*.map' -type f -delete \
    && rm -rf node_modules/.pnpm/@next+swc-linux-x64-gnu@* node_modules/.pnpm/typescript@* \
    && mkdir -p apps/web/.next/cache

# -------- runner --------
FROM node:22-bookworm-slim AS runner
WORKDIR /repo

# ffmpeg(영상 파이프라인) + 운영 유틸. sharp 는 자체 prebuilt libvips(@img/sharp-libvips-*)를
# 쓰므로 시스템 libvips 는 필요 없다. libjemalloc2 는 media 프로세스에만 LD_PRELOAD 된다
# (sharp/libvips 의 glibc malloc 단편화 완화). 런타임에 pnpm/corepack 은 없다 — 세 프로세스와
# 마이그레이션 모두 node 로 직접 실행한다(run-app.sh·entrypoint.sh).
# postgresql-client-17: 백업 pg_dump/pg_restore 는 서버(pg17)와 major 가 같거나 높아야
# 한다. bookworm 기본은 15 라 PGDG 저장소에서 17 을 받는다. zstd: 백업 번들 압축.
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini curl openssl ca-certificates gosu bash ffmpeg zstd libjemalloc2 gnupg \
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
    && useradd -u 1000 -g bebe -s /bin/bash -m bebe

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV MEDIA_ROLE=both
ENV MEDIA_PORT=3001
# 부팅마다 나가던 호출 둘을 끈다: Prisma 의 버전 확인(checkpoint) 배너와 corepack 의 pnpm
# 다운로드. 러너에 corepack 을 활성화하지 않았으니 pnpm 은 애초에 없고, 혹시 남은 호출이
# 있으면 조용히 받아오는 대신 실패로 드러난다.
ENV CHECKPOINT_DISABLE=1
ENV PRISMA_HIDE_UPDATE_MESSAGE=1
ENV COREPACK_ENABLE_NETWORK=0
# 릴리즈 태그(예: v0.0.11)를 이미지에 새긴다 — 설정·관리자 화면에 버전 표시. release.yml 이
# --build-arg APP_VERSION=<tag> 로 주입. 로컬/미지정 빌드는 'dev'.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

# 빌드된 .next + apps/media 소스 + 프로덕션 node_modules + 양쪽 prisma client.
# 여기서 소유권을 정하므로 entrypoint 가 매 부팅 .next 를 재귀 chown 하지 않는다.
COPY --from=builder --chown=1000:1000 /repo /repo

COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY --chmod=755 docker/run-app.sh /usr/local/bin/run-app.sh
COPY --chmod=755 docker/bebe-restore.sh /usr/local/bin/bebe-restore

VOLUME ["/data", "/backups"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=40s \
  CMD curl -f http://localhost:3000/api/health || exit 1

# tini -g: 컨테이너 stop 의 SIGTERM 을 자식 프로세스 그룹 전체(run-app.sh 와 세 node)에
# 전달한다. run-app.sh 도 자식에게 TERM 을 넘기고 grace 안에 내려가길 기다린다.
ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["/usr/local/bin/run-app.sh"]
