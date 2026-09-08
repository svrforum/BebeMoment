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
# 그 뒤 런타임이 읽지 않는 것들을 더 걷어낸다. 아래는 전부 이미지를 띄워 확인한 목록이다
# (부팅 → migrate deploy → /api/health?deep=1 → 페이지 렌더가 제거 전후로 동일):
#   - .next/server 의 소스맵 — next start 는 소스맵을 켜지 않는다(스택 트레이스는 지금도 청크 기준)
#   - @next/swc — next build/dev 전용 네이티브 바이너리(125MB), next start 는 로드하지 않는다
#   - typescript — prisma 의 optional peer. migrate deploy 는 없이도 돈다(오프라인 부팅으로 확인)
#   - lucide-react(39MB) — Turbopack 이 아이콘을 클라이언트 청크에 인라인한다. .next 어디에도
#     `require("lucide-react")` 가 없고(client-reference-manifest 에 남는 건 모듈 경로 문자열뿐)
#     제거 전후 /login·/signup 응답이 바이트까지 같다
#   - lightningcss(20MB) — Tailwind/Next 의 빌드 타임 CSS 컴파일러. CSS 는 이미 .next/static 에 있다
#   - playwright(16MB) — e2e 러너가 next 의 peer 로 딸려온 것
#   - pglite(24MB)·rolldown(23MB) — `prisma dev`(로컬 임베디드 DB) 전용. migrate deploy 는 안 탄다
# ⚠️ 반대로 이것들은 **지우면 부팅이 죽는다**(전부 실제로 깨뜨려 확인):
#   - @prisma/studio-core·@prisma/dev — prisma CLI 의 build/index.js 가 top-level 에서
#     `@prisma/studio-core/data/bff`·`@prisma/dev/internal/state` 를 require 한다
#   - effect — @prisma/config 이 require 한다(위 둘의 부속이 아니라 별도 경로)
#   - @swc/core(27MB) — next start 가 next.config.mjs 를 읽고, 그게 next-intl/plugin →
#     MessageExtractor → @swc/core 로 이어진다. 빌드 전용처럼 보이지만 런타임 의존이다
# .next/cache 는 런타임에 Next 가 unstable_cache 항목을 쓰는 곳 — 비워 두되 존재해야 한다.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    CI=true pnpm install --prod --frozen-lockfile --ignore-scripts --offline \
    && node docker/prune-store.mjs \
    && rm -rf apps/web/.next/cache e2e \
    && find apps/web/.next/server -name '*.map' -type f -delete \
    && rm -rf node_modules/.pnpm/@next+swc-linux-x64-gnu@* node_modules/.pnpm/typescript@* \
    && rm -rf node_modules/.pnpm/lucide-react@* \
       node_modules/.pnpm/lightningcss-linux-x64-gnu@* \
       node_modules/.pnpm/playwright@* node_modules/.pnpm/playwright-core@* \
       node_modules/.pnpm/@playwright+* \
       node_modules/.pnpm/@electric-sql+pglite* \
       node_modules/.pnpm/rolldown@* node_modules/.pnpm/@rolldown+* \
    && mkdir -p apps/web/.next/cache

# -------- ffmpeg --------
# 영상 파이프라인(apps/media)이 spawn 하는 ffmpeg·ffprobe. Debian 의 `ffmpeg` 패키지는
# libavdevice→SDL→Mesa→libLLVM-15 사슬 때문에 러너 apt 레이어의 543MB 중 ~480MB 를 혼자
# 차지했다(LLVM 112MB·Mesa 25MB·libz3 23MB·Intel media SDK 26MB…). 정적 바이너리 두 개면
# 280MB 로 끝나고, 배포판 ffmpeg 5.1 대신 8.x 를 쓴다.
#
# 출처: mwader/static-ffmpeg — 버전 태그 + 다이제스트로 고정한다(floating latest 금지).
# 다이제스트는 멀티아치 인덱스라 이 스테이지가 빌드 대상 플랫폼(amd64/arm64)의 바이너리를
# 알아서 고른다 — 릴리즈가 지금은 amd64 만 만들지만 arm64 를 켜도 이 줄은 그대로다.
# 왜 이걸 골랐나: ① 8.x 정식 버전 태그가 있고(BtbN 의 GitHub 릴리즈는 파일명이 git-describe
# 라 매일 바뀌고 오래된 autobuild 는 지워진다), ② johnvansickle 빌드는 7.0.2 에서 멈췄고,
# ③ 완전 정적(musl static)이라 bookworm-slim 에 추가 apt 패키지가 필요 없다.
# 라이선스: configure 에 --enable-gpl --enable-version3 가 있고 --enable-nonfree 는 없다
# → GPL-3.0-or-later, 재배포 가능. 별도 프로그램으로 실행할 뿐 AGPL 본체와 링크되지 않는다.
# 자세한 내역은 THIRD_PARTY_NOTICES.md.
FROM mwader/static-ffmpeg:9.0.1@sha256:54e55b0cb8f672870fc38ceb2e6c411855cb3b39c505f5f3b2505ee01ed5f2b7 AS ffmpeg

# -------- runner --------
FROM node:22-bookworm-slim AS runner
WORKDIR /repo

# 운영 유틸. sharp 는 자체 prebuilt libvips(@img/sharp-libvips-*)를 쓰므로 시스템 libvips 는
# 필요 없다. libjemalloc2 는 media 프로세스에만 LD_PRELOAD 된다
# (sharp/libvips 의 glibc malloc 단편화 완화). 런타임에 pnpm/corepack 은 없다 — 세 프로세스와
# 마이그레이션 모두 node 로 직접 실행한다(run-app.sh·entrypoint.sh).
# postgresql-client-17: 백업 pg_dump/pg_restore 는 서버(pg17)와 major 가 같거나 높아야
# 한다. bookworm 기본은 15 라 PGDG 저장소에서 17 을 받는다. zstd: 백업 번들 압축.
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini curl openssl ca-certificates gosu bash zstd libjemalloc2 gnupg \
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

COPY --from=ffmpeg /ffmpeg /ffprobe /usr/local/bin/

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
