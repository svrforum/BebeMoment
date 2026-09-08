#!/usr/bin/env sh
set -e
cd /repo

# 이 이미지는 현재 linux/amd64 전용(arm64 빌드는 보류). ARM(시놀로지 ARM·라즈베리파이)에서
# QEMU 에뮬레이션으로 띄우면 sharp/ffmpeg 등이 불안정하다 — 일찍 명확히 안내한다.
arch="$(uname -m 2>/dev/null || echo unknown)"
case "$arch" in
  aarch64 | arm64 | armv7l | armv6l)
    echo "[entrypoint] ⚠️  This image is linux/amd64-only; detected $arch." >&2
    echo "[entrypoint]    ARM (ARM Synology / Raspberry Pi) is not supported yet — run on x86-64." >&2
    echo "[entrypoint]    (If you are intentionally emulating amd64 via QEMU, expect instability.)" >&2
    ;;
esac

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

# Retarget the baked-in 'bebe' user (uid/gid 1000) to the requested PUID/PGID.
# Image base is Debian (node:22-bookworm-slim), so use usermod/groupmod — NOT
# delete+recreate. Synology's standard PGID=100 collides with Debian's built-in
# `users` group (gid 100): deleting+recreating fails there and the container
# crash-loops at gosu. Instead reuse an existing group at the target GID, or
# retarget bebe's own group; -o allows duplicate ids defensively.
if [ "$(id -u bebe)" != "$PUID" ] || [ "$(id -g bebe)" != "$PGID" ]; then
  if getent group "$PGID" >/dev/null 2>&1; then
    target_group="$(getent group "$PGID" | cut -d: -f1)"
  else
    groupmod -o -g "$PGID" bebe
    target_group=bebe
  fi
  usermod -o -u "$PUID" -g "$target_group" bebe
fi

# 볼륨 소유권은 숫자 PUID:PGID 로 맞춘다 — 이름 'bebe:bebe' 는 PGID=100(DSM users) 일 때
# 그룹을 다시 1000 으로 되돌려 부팅마다 소유권이 뒤집혔다. 최상위를 맞춘 뒤 소유자가 다른
# 항목만 고치므로 사진 수만 장을 매번 다시 쓰지 않는다. /backups 도 같은 규칙 — 호스트가
# root 로 만든 바인드 마운트면 예약 백업이 전부 EACCES 였다.
fix_owner() {
  dir="$1"
  [ -d "$dir" ] || return 0
  chown "$PUID:$PGID" "$dir" 2>/dev/null || true
  find "$dir" \( ! -user "$PUID" -o ! -group "$PGID" \) -exec chown "$PUID:$PGID" {} + 2>/dev/null || true
}
fix_owner /data
fix_owner /backups

# 이미지는 1000:1000 으로 구워졌다(Dockerfile COPY --chown). 다른 PUID/PGID 로 띄울 때는
# Next 가 런타임에 쓰는 유일한 곳(.next/cache — unstable_cache 항목)만 맞춘다. .next 전체
# 재귀 chown 은 하지 않는다 — 7천 파일이 컨테이너마다 쓰기 레이어로 복사됐다.
if [ "$PUID" != "1000" ] || [ "$PGID" != "1000" ]; then
  fix_owner /repo/apps/web/.next/cache
fi

# Run migrations with the workspace-pinned Prisma CLI (v7), invoked with plain node from each
# package directory so it reads that package's prisma.config.ts (datasource url = DATABASE_URL).
# No pnpm/corepack at runtime — the pnpm wrapper used to download itself on first boot.
# Order matters: db-public first (public schema), db-media second (cross-schema FKs).
run_migrate() {
  pkg="$1"
  [ -f "packages/$pkg/prisma/schema.prisma" ] || return 0
  echo "running prisma migrate deploy ($pkg)…"
  (cd "packages/$pkg" && gosu bebe node node_modules/prisma/build/index.js migrate deploy) || {
    echo "$pkg migration failed"
    exit 1
  }
}
if [ -z "$PRISMA_SKIP_MIGRATE" ]; then
  run_migrate db-public
  run_migrate db-media
fi

# Sync bebe_web / bebe_media role passwords from env (idempotent).
# Requires psql + DATABASE_URL pointing to a superuser role.
if [ -n "$BEBE_WEB_DB_PASSWORD" ] && [ -n "$BEBE_MEDIA_DB_PASSWORD" ] && [ -n "$DATABASE_URL" ]; then
  if command -v psql >/dev/null 2>&1; then
    echo "updating bebe_web / bebe_media role passwords from env…"
    # psql 변수 바인딩(:'pw')으로 안전 인용 — 비밀번호에 작은따옴표가 있어도 깨지거나
    # 주입되지 않는다. ⚠️ `:var` 치환은 stdin/-f 스크립트에서만 동작하고 `-c` 에선 안 돼
    # 'syntax error at or near ":"' 로 실패한다 → here-doc(stdin) 으로 전달한다.
    if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v web_pw="$BEBE_WEB_DB_PASSWORD" -v media_pw="$BEBE_MEDIA_DB_PASSWORD" >/dev/null <<'SQL'
ALTER ROLE bebe_web PASSWORD :'web_pw';
ALTER ROLE bebe_media PASSWORD :'media_pw';
SQL
    then :; else echo "warn: failed to sync bebe_web / bebe_media passwords (roles may not exist yet)"; fi
  else
    echo "warn: psql not found; skipping role password sync. Install postgresql-client in image."
  fi
fi

exec gosu bebe "$@"
