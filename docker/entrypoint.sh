#!/usr/bin/env sh
set -e

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

# Ensure /data is writable by bebe
if [ -d /data ]; then
  chown -R bebe:bebe /data 2>/dev/null || true
fi

# Next.js writes incremental cache (`.next/cache/fetch-cache`, image cache,
# unstable_cache entries) at runtime. Builder stage created `.next` as
# root, so bebe (uid 1000) can't write there without this.
if [ -d /repo/apps/web/.next ]; then
  chown -R bebe:bebe /repo/apps/web/.next 2>/dev/null || true
fi

# Run migrations. Use the workspace-pinned Prisma CLI (v7) via `pnpm exec` so
# the version matches the schema + prisma.config.ts. `migrate deploy` reads the
# datasource url from each package's prisma.config.ts (env DATABASE_URL).
# Order matters: db-public first (public schema), db-media second (cross-schema FKs).
if [ -z "$PRISMA_SKIP_MIGRATE" ]; then
  if [ -f packages/db-public/prisma/schema.prisma ]; then
    echo "running prisma migrate deploy (db-public)…"
    gosu bebe pnpm --filter @bebe/db-public exec prisma migrate deploy || {
      echo "db-public migration failed"
      exit 1
    }
  fi
  if [ -f packages/db-media/prisma/schema.prisma ]; then
    echo "running prisma migrate deploy (db-media)…"
    gosu bebe pnpm --filter @bebe/db-media exec prisma migrate deploy || {
      echo "db-media migration failed"
      exit 1
    }
  fi
fi

# Sync bebe_web / bebe_media role passwords from env (idempotent).
# Requires psql + DATABASE_URL pointing to a superuser role.
if [ -n "$BEBE_WEB_DB_PASSWORD" ] && [ -n "$BEBE_MEDIA_DB_PASSWORD" ] && [ -n "$DATABASE_URL" ]; then
  if command -v psql >/dev/null 2>&1; then
    echo "updating bebe_web / bebe_media role passwords from env…"
    # psql 변수 바인딩(:'pw')으로 안전 인용 — 비밀번호에 작은따옴표가 있어도 SQL 이
    # 깨지거나 주입되지 않는다(restore.ts ensureRole 와 동일 패턴).
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v pw="$BEBE_WEB_DB_PASSWORD" \
      -c "ALTER ROLE bebe_web PASSWORD :'pw'" >/dev/null \
      || echo "warn: failed to set bebe_web password (role may not exist yet)"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v pw="$BEBE_MEDIA_DB_PASSWORD" \
      -c "ALTER ROLE bebe_media PASSWORD :'pw'" >/dev/null \
      || echo "warn: failed to set bebe_media password (role may not exist yet)"
  else
    echo "warn: psql not found; skipping role password sync. Install postgresql-client in image."
  fi
fi

exec gosu bebe "$@"
