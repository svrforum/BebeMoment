#!/usr/bin/env bash
# 한 컨테이너에서 media(내부 :3001) + web(:3000)를 함께 실행한다.
# 둘 중 하나라도 종료되면 컨테이너를 비정상 종료시켜 Docker가 재시작하게 한다.
# entrypoint.sh 가 root 셋업(PUID/PGID·migrate·role 동기화) 후 `gosu bebe`로
# 이 스크립트를 exec 한다 — 즉 여기 코드는 bebe 권한으로 돈다.
set -uo pipefail

MEDIA_PORT="${MEDIA_PORT:-3001}"

echo "[run-app] starting media on :${MEDIA_PORT}"
# pnpm --filter 로 apps/media 컨텍스트에서 start 실행 → tsx/소스가 그 곳에서 resolve.
# (루트에서 `node --loader tsx/esm` 하면 tsx 가 apps/media 의존성이라 안 잡힘.)
pnpm --filter @bebe/media start &
MEDIA_PID=$!

# web 의 /media 프록시가 첫 요청에서 502 나지 않도록 media health 대기.
echo "[run-app] waiting for media health…"
for _ in $(seq 1 30); do
  if curl -fsS "http://localhost:${MEDIA_PORT}/media/v1/health" >/dev/null 2>&1; then
    echo "[run-app] media is healthy"
    break
  fi
  if ! kill -0 "$MEDIA_PID" 2>/dev/null; then
    echo "[run-app] media exited during startup" >&2
    exit 1
  fi
  sleep 1
done

echo "[run-app] starting web on :3000"
pnpm --filter @bebe/web exec next start -p 3000 -H 0.0.0.0 &
WEB_PID=$!

shutdown() {
  trap - TERM INT
  echo "[run-app] signal received, stopping children"
  kill -TERM "$MEDIA_PID" "$WEB_PID" 2>/dev/null || true
  wait "$MEDIA_PID" "$WEB_PID" 2>/dev/null || true
  exit 0
}
trap shutdown TERM INT

# 둘 중 하나라도 먼저 종료되면 컨테이너 전체를 내린다(Docker restart 유도).
wait -n
echo "[run-app] a child process exited — shutting down container" >&2
kill -TERM "$MEDIA_PID" "$WEB_PID" 2>/dev/null || true
wait 2>/dev/null || true
exit 1
