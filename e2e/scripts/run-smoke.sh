#!/usr/bin/env bash
# Starts dev infra, web, media, waits for health, runs Playwright smoke, tears down.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# 3100 은 이 호스트에서 다른 서비스(PM2)가 오래 쓰고 있었다 — 남의 포트를 뺏지 않는다.
PORT="${PORT:-3199}"
export PORT

# Load root .env so Prisma CLI and dev servers see DATABASE_URL etc.
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

# ⚠️ e2e 는 시작할 때 DB 를 통째로 비운다. 이 리포에서 "dev DB" 라 부르는 것이
# 셀프호스팅 인스턴스에서는 그대로 프로덕션인 경우가 있어(운영 컨테이너가 같은 postgres 에
# 붙는다), .env 의 DATABASE_URL 을 그대로 쓰면 실제 가족 사진이 사라진다.
# 그래서 전용 스택(docker-compose.e2e.yml — 다른 포트·tmpfs 볼륨)을 띄우고 접속 정보를
# 여기서 덮어쓴다. 아래 값들은 .env 를 source 한 뒤에 와야 한다.
export DATABASE_URL="postgres://bebe:bebe@localhost:55432/bebe"
export DATABASE_URL_WEB="$DATABASE_URL"
export DATABASE_URL_MEDIA="$DATABASE_URL"
export REDIS_URL="redis://localhost:56379"
COMPOSE_FILE_E2E="docker-compose.e2e.yml"
COMPOSE_PROJECT="bebe-e2e"

# Docker may need sudo on this host; detect and wrap.
if docker ps >/dev/null 2>&1; then
  DC=(docker compose)
else
  DC=(sudo -n docker compose)
  # 스펙의 resetDatabase 도 같은 방식으로 docker 를 불러야 한다.
  export BEBE_E2E_SUDO=1
fi

cleanup() {
  echo "== cleanup =="
  "${DC[@]:-docker compose}" -p "${COMPOSE_PROJECT:-bebe-e2e}" -f "${COMPOSE_FILE_E2E:-docker-compose.e2e.yml}" down -v >/dev/null 2>&1 || true
  [[ -n "${WEB_PID:-}" ]] && kill "$WEB_PID" 2>/dev/null || true
  [[ -n "${MEDIA_PID:-}" ]] && kill "$MEDIA_PID" 2>/dev/null || true
  # Kill any descendant next/tsx processes we might have left.
  pkill -P $$ 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$ROOT/.dev"

# 1. Ensure dev infra running
echo "== e2e infra =="
# 이전 실행 잔여물을 먼저 치운다 — 남아 있으면 데이터가 섞이고, 가드가 정당한 실행을 막는다.
"${DC[@]}" -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE_E2E" down -v >/dev/null 2>&1 || true
# down 은 포트가 실제로 풀리기 전에 돌아온다 — docker 의 프록시 정리와 겹치면 bind 가
# 실패하므로 몇 번 다시 시도한다.
UP_OK=0
for _ in {1..10}; do
  if "${DC[@]}" -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE_E2E" up -d >/dev/null 2>&1; then
    UP_OK=1
    break
  fi
  sleep 2
done
if [[ "$UP_OK" != "1" ]]; then
  echo "!! e2e 인프라를 띄우지 못했습니다 (포트 55432/56379 충돌?)"
  "${DC[@]}" -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE_E2E" up -d || true
  exit 1
fi

# Wait for postgres healthy — tmpfs 볼륨이라 매번 initdb 를 새로 하므로 더 오래 걸린다.
# 호스트에서 매핑된 포트로 확인한다(컨테이너 내부 exec 보다 실제 접속 가능 여부에 가깝다).
PG_READY=0
for _ in {1..90}; do
  if "${DC[@]}" -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE_E2E" exec -T postgres \
      pg_isready -U bebe -h 127.0.0.1 >/dev/null 2>&1; then
    PG_READY=1
    break
  fi
  sleep 1
done
if [[ "$PG_READY" != "1" ]]; then
  echo "!! e2e postgres 가 준비되지 않았습니다"
  "${DC[@]}" -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE_E2E" logs --tail 30 postgres || true
  exit 1
fi

# 2. Ensure DB is migrated (public first, then media for cross-schema FKs)
echo "== migrate =="
pnpm --filter @bebe/db-public exec prisma migrate deploy >/dev/null
pnpm --filter @bebe/db-media  exec prisma migrate deploy >/dev/null

# 3. Clean all test data (full truncate to ensure deterministic state)
#
# ⚠️ 이 TRUNCATE 는 가족·사용자·사진을 전부 지운다. 이 리포에서 "dev DB" 라고 부르는
# docker-compose.dev.yml 의 postgres 가 셀프호스팅 인스턴스에서는 **그대로 프로덕션**인
# 경우가 있어(운영 컨테이너가 같은 postgres 에 붙는다), 대상을 잘못 잡으면 실제 가족
# 사진이 사라진다. 그래서 e2e 전용 포트를 가리키고 있는지 확인하고, 아니면 멈춘다.
if [[ "$DATABASE_URL" != *"localhost:55432"* && "${BEBE_E2E_ALLOW_WIPE:-}" != "1" ]]; then
  echo "!! 중단: DATABASE_URL 이 e2e 전용 스택(localhost:55432)이 아닙니다."
  echo "!!   현재: ${DATABASE_URL//:*@/:***@}"
  echo "!! e2e 는 DB 를 전부 지우므로 운영 DB 일 수 있는 대상에는 실행하지 않습니다."
  exit 1
fi

"${DC[@]}" -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE_E2E" exec -T postgres psql -U bebe -d bebe -c "
  TRUNCATE TABLE media.asset_babies, media.assets, public.invites, public.memberships, public.babies, public.families, public.sessions, public.oidc_identities, public.users, public.app_settings, public.setting_history RESTART IDENTITY CASCADE;
" >/dev/null

# 4. Start web (custom port)
# The @bebe/web `dev` script hard-codes `-p 3000`, so invoke next directly with the target port.
echo "== starting web on :$PORT =="
(
  cd "$ROOT/apps/web"
  PORT=$PORT PUBLIC_URL="http://localhost:$PORT" exec pnpm exec next dev -p "$PORT"
) > "$ROOT/.dev/web.log" 2>&1 &
WEB_PID=$!

# 5. Start media (tus + BullMQ worker + SSE)
echo "== starting media =="
pnpm --filter @bebe/media dev > "$ROOT/.dev/media.log" 2>&1 &
MEDIA_PID=$!

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
