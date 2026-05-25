#!/usr/bin/env bash
# Build + run the web container against the host's Postgres / Redis / media.
# Use this when you want production-mode performance locally without
# spinning up the full compose stack.
set -euo pipefail

cd "$(dirname "$0")/.."

ROOT_ENV=".env"
if [ ! -f "$ROOT_ENV" ]; then
  echo "missing $ROOT_ENV — copy values from a teammate or .env.example" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$ROOT_ENV"; set +a

IMAGE="${IMAGE:-bebe-web:local}"
NAME="${NAME:-bebe-web}"

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "==> building $IMAGE"
  sudo docker build -t "$IMAGE" -f docker/web.Dockerfile .
fi

echo "==> stopping previous container (if any)"
sudo docker rm -f "$NAME" 2>/dev/null || true

echo "==> starting $NAME (host network — uses your existing Postgres/Redis/media)"
sudo docker run -d --name "$NAME" --network=host \
  -e NODE_ENV=production \
  -e DATABASE_URL="${DATABASE_URL}" \
  -e REDIS_URL="${REDIS_URL}" \
  -e SECRET_KEY="${SECRET_KEY}" \
  -e PUBLIC_URL="${PUBLIC_URL}" \
  -e STORAGE_PATH="${STORAGE_PATH:-/data}" \
  -e ADMIN_USER_EMAIL="${ADMIN_USER_EMAIL:-}" \
  -e MEDIA_INTERNAL_URL="${MEDIA_INTERNAL_URL:-http://localhost:3001}" \
  -e NEXT_PUBLIC_MEDIA_BASE_URL="${NEXT_PUBLIC_MEDIA_BASE_URL:-${PUBLIC_URL}}" \
  -e MEDIA_PUBLIC_BASE_URL="${MEDIA_PUBLIC_BASE_URL:-${PUBLIC_URL}}" \
  -e MEDIA_SERVICE_TOKEN="${MEDIA_SERVICE_TOKEN}" \
  -e MEDIA_JWT_SECRET="${MEDIA_JWT_SECRET}" \
  -e PRISMA_SKIP_MIGRATE=1 \
  -e LOG_LEVEL="${LOG_LEVEL:-info}" \
  -e PORT=3000 \
  -e HOSTNAME=0.0.0.0 \
  -v "${STORAGE_PATH:-/opt/stacks/bebe-moment/.dev/data}:/data" \
  "$IMAGE"

sleep 3
echo "==> logs (last 10 lines):"
sudo docker logs "$NAME" 2>&1 | tail -10
echo
echo "==> serving on http://localhost:3000  (and http://${PUBLIC_URL#*://})"
echo "   stop:    sudo docker rm -f $NAME"
echo "   logs:    sudo docker logs -f $NAME"
echo "   rebuild: SKIP_BUILD=0 $0   (or just: $0)"
echo "   skip build: SKIP_BUILD=1 $0"
