#!/usr/bin/env bash
# Hard-limit check: no source file may exceed MAX_LINES.
# CLAUDE.md §6.2 — anything over 1000 lines must be split before merge.
# Usage: scripts/check-line-limit.sh [path...]   (default: full repo)
set -euo pipefail

cd "$(dirname "$0")/.."

MAX_LINES="${MAX_LINES:-1000}"

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

over=()
for f in "${files[@]}"; do
  lines=$(wc -l <"$f" 2>/dev/null || echo 0)
  if [ "$lines" -gt "$MAX_LINES" ]; then
    over+=("$lines  $f")
  fi
done

if [ ${#over[@]} -gt 0 ]; then
  echo "✗  ${MAX_LINES}+ 줄 hard limit 위반 — 분해 필수:"
  printf '   %s\n' "${over[@]}" | sort -rn
  echo
  echo "기준은 CLAUDE.md §6.2. 책임을 쪼개서 별도 파일로 옮기세요."
  exit 1
fi

echo "✓ 모든 소스 파일이 ${MAX_LINES}줄 이하입니다 ($(printf '%s\n' "${files[@]}" | wc -l)개 파일 검사)"
