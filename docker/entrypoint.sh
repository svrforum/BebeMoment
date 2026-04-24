#!/usr/bin/env sh
set -e

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

# Adjust uid/gid of 'bebe' user if differ
if [ "$(id -u bebe)" != "$PUID" ] || [ "$(id -g bebe)" != "$PGID" ]; then
  delgroup bebe 2>/dev/null || true
  deluser bebe 2>/dev/null || true
  addgroup -g "$PGID" -S bebe 2>/dev/null || true
  adduser -u "$PUID" -S bebe -G bebe 2>/dev/null || true
fi

# Ensure /data is writable by bebe
if [ -d /data ]; then
  chown -R bebe:bebe /data 2>/dev/null || true
fi

# Run migrations (web container; media sets PRISMA_SKIP_MIGRATE=1)
# Order matters: db-public first (public schema), db-media second (cross-schema FKs).
if [ -z "$PRISMA_SKIP_MIGRATE" ]; then
  if [ -f packages/db-public/prisma/schema.prisma ]; then
    echo "running prisma migrate deploy (db-public)…"
    gosu bebe npx prisma migrate deploy --schema=packages/db-public/prisma/schema.prisma || {
      echo "db-public migration failed"
      exit 1
    }
  fi
  if [ -f packages/db-media/prisma/schema.prisma ]; then
    echo "running prisma migrate deploy (db-media)…"
    gosu bebe npx prisma migrate deploy --schema=packages/db-media/prisma/schema.prisma || {
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
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
      -c "ALTER ROLE bebe_web PASSWORD '$BEBE_WEB_DB_PASSWORD'" >/dev/null \
      || echo "warn: failed to set bebe_web password (role may not exist yet)"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
      -c "ALTER ROLE bebe_media PASSWORD '$BEBE_MEDIA_DB_PASSWORD'" >/dev/null \
      || echo "warn: failed to set bebe_media password (role may not exist yet)"
  else
    echo "warn: psql not found; skipping role password sync. Install postgresql-client in image."
  fi
fi

exec gosu bebe "$@"
