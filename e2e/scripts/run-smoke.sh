#!/usr/bin/env bash
# Starts dev infra, web, worker, waits for health, runs Playwright smoke, tears down.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PORT="${PORT:-3100}"
export PORT

# Load root .env so Prisma CLI and dev servers see DATABASE_URL etc.
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

# Docker may need sudo on this host; detect and wrap.
if docker ps >/dev/null 2>&1; then
  DC=(docker compose)
else
  DC=(sudo -n docker compose)
fi

cleanup() {
  echo "== cleanup =="
  [[ -n "${WEB_PID:-}" ]] && kill "$WEB_PID" 2>/dev/null || true
  [[ -n "${WORKER_PID:-}" ]] && kill "$WORKER_PID" 2>/dev/null || true
  # Kill any descendant next/tsx processes we might have left.
  pkill -P $$ 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$ROOT/.dev"

# 1. Ensure dev infra running
echo "== dev infra =="
"${DC[@]}" -f docker-compose.dev.yml up -d >/dev/null

# Wait for postgres healthy
for _ in {1..30}; do
  if "${DC[@]}" -f docker-compose.dev.yml exec -T postgres pg_isready -U bebe >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# 2. Ensure DB is migrated
echo "== migrate =="
pnpm --filter @bebe/db exec prisma migrate deploy >/dev/null

# 3. Clean all test data (full truncate to ensure deterministic state)
"${DC[@]}" -f docker-compose.dev.yml exec -T postgres psql -U bebe -d bebe -c "
  TRUNCATE TABLE asset_babies, assets, invites, memberships, babies, families, sessions, oidc_identities, users, app_settings, setting_history RESTART IDENTITY CASCADE;
" >/dev/null

# 4. Start web (custom port)
# The @bebe/web `dev` script hard-codes `-p 3000`, so invoke next directly with the target port.
echo "== starting web on :$PORT =="
(
  cd "$ROOT/apps/web"
  PORT=$PORT PUBLIC_URL="http://localhost:$PORT" exec pnpm exec next dev -p "$PORT"
) > "$ROOT/.dev/web.log" 2>&1 &
WEB_PID=$!

# 5. Start worker
echo "== starting worker =="
pnpm --filter @bebe/worker dev > "$ROOT/.dev/worker.log" 2>&1 &
WORKER_PID=$!

# 6. Wait for web health
echo "== wait for web =="
for _ in {1..120}; do
  if curl -sf "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
    echo "web healthy"
    break
  fi
  sleep 1
done

if ! curl -sf "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
  echo "== web never became healthy; last 50 lines of web.log =="
  tail -n 50 "$ROOT/.dev/web.log" || true
  exit 1
fi

# 7. Run Playwright tests
echo "== playwright =="
cd "$ROOT/e2e"
BASE_URL="http://localhost:$PORT" pnpm exec playwright test "$@"
