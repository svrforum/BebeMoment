#!/usr/bin/env bash
# 2단계 라인 검사 (CLAUDE.md §6.2):
#   - WARN_LINES(기본 1000)  : 경고만 — 슬슬 책임을 쪼갤 때라는 넛지. 실패 안 함.
#   - MAX_LINES(기본 1500)   : 하드 한도 — 넘으면 분해 필수, exit 1 로 CI/훅 차단.
# Usage: scripts/check-line-limit.sh [path...]   (default: full repo)
set -euo pipefail

cd "$(dirname "$0")/.."

WARN_LINES="${WARN_LINES:-1000}"
MAX_LINES="${MAX_LINES:-1500}"

# What counts as "source"
INCLUDE_EXTS='ts|tsx|js|jsx'

# What gets ignored. Add patterns by editing here.
EXCLUDE_REGEX='/node_modules/|/\.next/|/\.dev/|/generated/|/dist/|/coverage/|/\.git/|/build/|\.test\.tsx?$|\.spec\.tsx?$'

paths=("${@:-.}")

mapfile -t files < <(
  find "${paths[@]}" -type f -regextype posix-extended -regex ".*\.($INCLUDE_EXTS)$" 2>/dev/null \
    | grep -vE "$EXCLUDE_REGEX" \
    | sort
)

over=()   # > MAX_LINES (hard)
warn=()   # WARN_LINES < n <= MAX_LINES (soft)
for f in "${files[@]}"; do
  lines=$(wc -l <"$f" 2>/dev/null || echo 0)
  if [ "$lines" -gt "$MAX_LINES" ]; then
    over+=("$lines  $f")
  elif [ "$lines" -gt "$WARN_LINES" ]; then
    warn+=("$lines  $f")
  fi
done

if [ ${#warn[@]} -gt 0 ]; then
  echo "⚠️  ${WARN_LINES}줄 초과 — 슬슬 분해 고려(경고, 차단 안 함):"
  printf '   %s\n' "${warn[@]}" | sort -rn
  echo
fi

if [ ${#over[@]} -gt 0 ]; then
  echo "✗  ${MAX_LINES}줄 hard limit 위반 — 분해 필수:"
  printf '   %s\n' "${over[@]}" | sort -rn
  echo
  echo "기준은 CLAUDE.md §6.2. 책임을 쪼개서 별도 파일로 옮기세요."
  exit 1
fi

echo "✓ 모든 소스 파일이 ${MAX_LINES}줄 이하입니다 ($(printf '%s\n' "${files[@]}" | wc -l)개 파일 검사, 경고 ${#warn[@]}건)"
