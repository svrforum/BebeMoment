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

# Run migrations (web container; worker sets PRISMA_SKIP_MIGRATE=1)
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

exec gosu bebe "$@"
