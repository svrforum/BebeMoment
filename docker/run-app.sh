#!/usr/bin/env bash
# 한 컨테이너에서 media(내부 :3001) + web(:3000) + 알림 워커를 함께 실행한다.
# 셋 중 하나라도 종료되면 컨테이너를 비정상 종료시켜 Docker 가 재시작하게 한다.
# entrypoint.sh 가 root 셋업(PUID/PGID·migrate·role 동기화) 후 `gosu bebe` 로 이 스크립트를
# exec 한다 — 즉 여기 코드는 bebe 권한으로 돈다.
#
# 세 프로세스는 래퍼 없이 node 를 직접 자식으로 둔다(pnpm → sh → tsx 체인이 없다). 그래야
# 컨테이너 stop 의 SIGTERM 이 서버에 닿아 media 가 진행 중 트랜스코드를 끝내고 내려간다 —
# 래퍼만 TERM 을 받고 서버는 SIGKILL 을 맞던 것을 없앤다.
set -uo pipefail
cd /repo

MEDIA_PORT="${MEDIA_PORT:-3001}"
# 자식들이 내려갈 시간. media 자체 grace(MEDIA_SHUTDOWN_GRACE_MS, 기본 30s)보다 길고
# compose 의 stop_grace_period 보다 짧아야 Docker 가 그 전에 SIGKILL 하지 않는다.
SHUTDOWN_GRACE_S="${APP_SHUTDOWN_GRACE_S:-45}"
# 프로세스별 힙 상한 — 한 프로세스가 컨테이너 메모리를 다 먹어 셋이 함께 OOM 되는 것을 막는다.
HEAP_WEB_MB="${APP_HEAP_WEB_MB:-768}"
HEAP_MEDIA_MB="${APP_HEAP_MEDIA_MB:-640}"
HEAP_WORKER_MB="${APP_HEAP_WORKER_MB:-256}"

MEDIA_PID=""
WEB_PID=""
NOTIF_PID=""

live_pids() {
  local p
  for p in "$MEDIA_PID" "$WEB_PID" "$NOTIF_PID"; do
    [ -n "$p" ] && kill -0 "$p" 2>/dev/null && echo "$p"
  done
  return 0
}

stop_children() {
  local pids
  pids=$(live_pids)
  [ -n "$pids" ] || return 0
  # shellcheck disable=SC2086
  kill -TERM $pids 2>/dev/null || true
  for _ in $(seq 1 "$SHUTDOWN_GRACE_S"); do
    pids=$(live_pids)
    [ -n "$pids" ] || return 0
    sleep 1
  done
  echo "[run-app] children still running after ${SHUTDOWN_GRACE_S}s — killing" >&2
  # shellcheck disable=SC2086
  kill -KILL $pids 2>/dev/null || true
  wait 2>/dev/null || true
}

shutdown() {
  trap - TERM INT
  echo "[run-app] signal received, stopping children"
  stop_children
  exit 0
}
trap shutdown TERM INT

echo "[run-app] starting media on :${MEDIA_PORT}"
(
  cd apps/media
  jemalloc="$(ls /usr/lib/*/libjemalloc.so.2 2>/dev/null | head -n 1)"
  [ -n "$jemalloc" ] && export LD_PRELOAD="$jemalloc"
  export UV_THREADPOOL_SIZE="${UV_THREADPOOL_SIZE:-8}"
  export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=${HEAP_MEDIA_MB}"
  exec node --import tsx src/main.ts
) &
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
(
  cd apps/web
  export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=${HEAP_WEB_MB}"
  exec node node_modules/next/dist/bin/next start -p 3000 -H 0.0.0.0
) &
WEB_PID=$!

echo "[run-app] starting notifications worker"
(
  cd apps/web
  export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=${HEAP_WORKER_MB}"
  exec node --import tsx scripts/notifications-worker.ts
) &
NOTIF_PID=$!

# 셋 중 하나라도 먼저 종료되면 컨테이너 전체를 내린다(Docker restart 유도).
wait -n "$MEDIA_PID" "$WEB_PID" "$NOTIF_PID"
echo "[run-app] a child process exited — shutting down container" >&2
stop_children
exit 1
