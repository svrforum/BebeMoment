#!/bin/sh
set -e

# 서버는 비특권 사용자로 돈다. 모델 캐시는 호스트 바인드 볼륨이라 소유자가 제각각이고,
# 첫 기동 때는 insightface 가 여기에 모델팩을 받아야 한다 — 그래서 root 로 뜬 경우에만
# 볼륨 소유자를 PUID/PGID 로 맞춘 뒤 권한을 떨군다(§13 의 PUID/PGID 규약과 같은 이유).
# 이미 비-root 로 뜬 경우(compose 의 `user:`)는 그대로 실행한다.
PUID=${PUID:-1000}
PGID=${PGID:-1000}
MODEL_ROOT=${FACE_MODEL_ROOT:-/data/insightface}

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$MODEL_ROOT"
  chown "$PUID:$PGID" "$MODEL_ROOT" 2>/dev/null || true
  chown -R "$PUID:$PGID" "$MODEL_ROOT" 2>/dev/null || true
  exec setpriv --reuid "$PUID" --regid "$PGID" --clear-groups "$@"
fi

exec "$@"
