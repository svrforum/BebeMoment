#!/usr/bin/env bash
# docs/deployment-synology.md 의 compose 블록은 compose/docker-compose.yml 을 손으로 옮긴 것이라
# 어긋나기 쉽다. 문서 블록의 app.environment 키는 전부 표준 compose 에도 있어야 하고, 표준
# compose 가 일부러 뺀 MEDIA_PUBLIC_BASE_URL/NEXT_PUBLIC_MEDIA_BASE_URL 의 PUBLIC_URL 폴백이
# 문서에 되살아나면 안 된다(mixed-content 회귀). CI 가 돌린다.
set -euo pipefail
cd "$(dirname "$0")/.."

DOC=docs/deployment-synology.md
COMPOSE=compose/docker-compose.yml

# services.app.environment 아래(6칸 들여쓰기)의 키만 뽑는다.
app_env_keys() {
  awk '
    /^  [a-z]+:/ { in_app = ($1 == "app:"); in_env = 0 }
    in_app && /^    environment:/ { in_env = 1; next }
    in_app && in_env && /^    [a-z_]+:/ { in_env = 0 }
    in_app && in_env && /^      [A-Z_][A-Z0-9_]*:/ { sub(/:.*/, "", $1); print $1 }
  ' "$1"
}

doc_block="$(mktemp)"
trap 'rm -f "$doc_block"' EXIT
awk '/^```yaml/ { f = 1; next } /^```/ { f = 0 } f' "$DOC" > "$doc_block"

if ! grep -q '^  app:' "$doc_block"; then
  echo "❌ $DOC: compose 블록에서 app 서비스를 찾지 못했다" >&2
  exit 1
fi

missing="$(comm -23 <(app_env_keys "$doc_block" | sort -u) <(app_env_keys "$COMPOSE" | sort -u))"
if [ -n "$missing" ]; then
  echo "❌ $DOC 의 compose 블록에만 있는 env 키 — $COMPOSE 에 없다:" >&2
  printf '   %s\n' $missing >&2
  exit 1
fi

if grep -Eq '^\s+(NEXT_PUBLIC_)?MEDIA_PUBLIC_BASE_URL:\s*\$\{PUBLIC_URL' "$doc_block"; then
  echo "❌ $DOC: MEDIA_PUBLIC_BASE_URL/NEXT_PUBLIC_MEDIA_BASE_URL 을 PUBLIC_URL 로 채우면 안 된다" >&2
  echo "   (기본은 상대경로 /media/... — 미디어를 별도 호스트로 분리할 때만 절대 URL)" >&2
  exit 1
fi

echo "✅ $DOC compose 블록의 env 키가 $COMPOSE 와 일치한다"
