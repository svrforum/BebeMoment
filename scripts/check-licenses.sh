#!/usr/bin/env bash
# 의존성 라이선스 게이트 — 프로덕션 의존성 중 AGPL-3.0 과 비호환이거나 미상(Unknown)인
# 라이선스가 새로 들어오면 잡는다. 허용형(MIT/Apache/BSD/ISC 등) + (A)GPL 호환 카피레프트
# (MPL-2.0/LGPL-3.0) 는 통과. 새 의존성 추가 후 `pnpm licenses:check` 로 확인.
set -euo pipefail
cd "$(dirname "$0")/.."

# AGPL-3.0 과 호환되는(=AGPL 저작물에 포함 가능한) SPDX 식별자.
export ALLOW='MIT|MIT-0|MIT AND ISC|Apache-2.0|ISC|0BSD|BSD-2-Clause|BSD-3-Clause|BSD|BlueOak-1.0.0|CC-BY-4.0|CC0-1.0|Unlicense|Python-2.0|MPL-2.0|LGPL-3.0-or-later|LGPL-3.0-only|AGPL-3.0-only|AGPL-3.0-or-later|GPL-3.0-or-later|WTFPL|Zlib'
# 메타데이터 미상이나 수동 검토로 호환 확인된 예외(패키지명=실제 라이선스).
export ACK='combine-errors=실제 MIT (npm 메타에 SPDX 누락)
elkjs=prisma CLI(@prisma/studio-core)가 끌어오는 별도 모듈. 앱 코드가 import 하지 않고 수정 없이 그대로 실린다(검토 후 허용)'

tmp="$(mktemp)"
err="$(mktemp)"
trap 'rm -f "$tmp" "$err"' EXIT
# pnpm 이 실패했는데 빈 목록으로 넘어가면 아무것도 검사하지 않고 '통과' 가 찍힌다 — 그게
# 실제로 일어나던 동작이다. 실패는 실패로 끝낸다.
if ! pnpm licenses list --prod --json >"$tmp" 2>"$err"; then
  echo "✗ pnpm licenses list 실패 — 라이선스를 확인하지 못했습니다:" >&2
  cat "$err" >&2
  exit 1
fi
export LIC_FILE="$tmp"

python3 <<'PY'
import os, json, re
allow = set(os.environ["ALLOW"].split("|"))
ack = dict(kv.split("=", 1) for kv in os.environ["ACK"].split("\n") if "=" in kv)

def compatible(lic):
    # SPDX 식 처리: 'A AND B' 는 둘 다 호환이어야, '(A OR B)' 는 하나만 호환이면 OK.
    lic = lic.strip().strip("()").strip()
    # 메타데이터에 소문자 연산자('MIT and ISC')가 섞여 온다 — SPDX 는 대문자지만 뜻은 같다.
    lic = re.sub(r"\s+(and|or)\s+", lambda m: f" {m.group(1).upper()} ", lic)
    if lic in allow:
        return True
    if " OR " in lic:
        return any(compatible(p) for p in lic.split(" OR "))
    if " AND " in lic:
        return all(compatible(p) for p in lic.split(" AND "))
    return False

with open(os.environ["LIC_FILE"]) as fh:
    raw = fh.read().strip()
data = json.loads(raw or "{}")
if not isinstance(data, dict) or not data:
    print("✗ pnpm licenses list 가 프로덕션 의존성을 하나도 돌려주지 않았습니다 — 검사하지 못했습니다.")
    raise SystemExit(1)
fail = False
for lic, pkgs in data.items():
    if compatible(lic):
        continue
    for p in (pkgs if isinstance(pkgs, list) else [pkgs]):
        name = p.get("name") if isinstance(p, dict) else str(p)
        if name in ack:
            print(f"  ↪︎ ack  {name} ({lic}) — {ack[name]}")
        else:
            print(f"  ✗ review  {name} — {lic} (AGPL 호환 미확인)")
            fail = True
if fail:
    print("✗ AGPL 호환 미확인 라이선스 — 위 패키지를 확인하고 호환되면 ALLOW/ACK 에 추가하세요.")
    raise SystemExit(1)
print("✓ 모든 프로덕션 의존성이 AGPL-3.0 과 호환됩니다.")
PY
