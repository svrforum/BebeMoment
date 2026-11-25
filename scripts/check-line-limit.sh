#!/usr/bin/env bash
# 2단계 라인 검사:
#   - WARN_LINES(기본 1000)  : 경고만 — 슬슬 책임을 쪼갤 때라는 넛지. 실패 안 함.
#   - MAX_LINES(기본 1500)   : 하드 한도 — 넘으면 분해 필수, exit 1 로 CI/훅 차단.
# Usage: scripts/check-line-limit.sh [path...]   (default: full repo)
set -euo pipefail

cd "$(dirname "$0")/.."

WARN_LINES="${WARN_LINES:-1000}"
MAX_LINES="${MAX_LINES:-1500}"

# What counts as "source"
INCLUDE_EXTS='ts|tsx|js|jsx'

# 안드로이드 셸의 네이티브 소스(android-app/**/src/main/java/**/*.java)도 같은 한도를
# 받는다 — MainActivity 가 1,450줄까지 자란 뒤 추가. .java 를 INCLUDE_EXTS 에 넣지 않고
# 경로로 좁히는 이유는 생성물(capacitor-cordova-android-plugins 등)을 끌어오지 않기 위해서다.
ANDROID_JAVA_PATH='*android-app/*/src/main/java/*'

# What gets ignored. Add patterns by editing here.
# .claude/worktrees/ 와 .worktrees/ 는 에이전트 worktree(리포 사본)가 사는 곳이라 같은 파일을
# 여러 번 세게 된다.
EXCLUDE_REGEX='/node_modules/|/\.next/|/\.dev/|/\.claude/|/\.worktrees/|/generated/|/dist/|/coverage/|/\.git/|/build/|/src/main/assets/public/|\.test\.tsx?$|\.spec\.tsx?$'

# 위 목록 중 디렉터리 이름 하나로 끝나는 것은 find 가 아예 들어가지 않게 잘라 낸다. 걸러 내는
# 결과는 EXCLUDE_REGEX 와 같지만, 그러지 않으면 node_modules·.next·worktree 사본을 매번 전부
# 훑느라 몇 초씩 걸린다(턴마다 도는 검사다).
PRUNE_DIRS=(node_modules .next .dev .claude .worktrees generated dist coverage .git build)
prune_expr=()
for d in "${PRUNE_DIRS[@]}"; do
  prune_expr+=(-name "$d" -o)
done
unset 'prune_expr[${#prune_expr[@]}-1]'

paths=("${@:-.}")

list_files() {
  find "${paths[@]}" -type d \( "${prune_expr[@]}" \) -prune -o -type f "$@" -print 2>/dev/null \
    | grep -vE "$EXCLUDE_REGEX" \
    | sort
}

mapfile -t files < <(list_files -regextype posix-extended -regex ".*\.($INCLUDE_EXTS)$")
mapfile -t android_files < <(list_files -path "$ANDROID_JAVA_PATH" -name '*.java')
files+=("${android_files[@]}")

over=()   # > MAX_LINES (hard)
warn=()   # WARN_LINES < n <= MAX_LINES (soft)
# 파일마다 wc 를 띄우면 수백 번 fork 해서 그것만으로 몇 초다 — 한 번에 센다.
# wc 는 여러 파일을 받으면 끝에 "total" 줄을 붙인다. 소스 경로는 확장자로 끝나서 겹치지 않는다.
if [ ${#files[@]} -gt 0 ]; then
  while read -r lines f; do
    [ "$f" = total ] && continue
    if [ "$lines" -gt "$MAX_LINES" ]; then
      over+=("$lines  $f")
    elif [ "$lines" -gt "$WARN_LINES" ]; then
      warn+=("$lines  $f")
    fi
  done < <(printf '%s\0' "${files[@]}" | xargs -0 wc -l 2>/dev/null || true)
fi

if [ ${#warn[@]} -gt 0 ]; then
  echo "⚠️  ${WARN_LINES}줄 초과 — 슬슬 분해 고려(경고, 차단 안 함):"
  printf '   %s\n' "${warn[@]}" | sort -rn
  echo
fi

if [ ${#over[@]} -gt 0 ]; then
  echo "✗  ${MAX_LINES}줄 hard limit 위반 — 분해 필수:"
  printf '   %s\n' "${over[@]}" | sort -rn
  echo
  echo "책임을 쪼개서 별도 파일로 옮기세요."
  exit 1
fi

echo "✓ 모든 소스 파일이 ${MAX_LINES}줄 이하입니다 ($(printf '%s\n' "${files[@]}" | wc -l)개 파일 검사, 경고 ${#warn[@]}건)"
