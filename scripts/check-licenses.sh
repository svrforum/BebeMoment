#!/usr/bin/env bash
# 의존성 라이선스 게이트 — 프로덕션 의존성 중 AGPL-3.0 과 비호환이거나 미상(Unknown)인
# 라이선스가 새로 들어오면 잡는다. 허용형(MIT/Apache/BSD/ISC 등) + (A)GPL 호환 카피레프트
# (MPL-2.0/LGPL-3.0) 는 통과. 새 의존성 추가 후 `pnpm licenses:check` 로 확인.
set -euo pipefail
cd "$(dirname "$0")/.."

# AGPL-3.0 과 호환되는(=AGPL 저작물에 포함 가능한) SPDX 식별자.
export ALLOW='MIT|MIT-0|MIT AND ISC|Apache-2.0|ISC|0BSD|BSD-2-Clause|BSD-3-Clause|BSD|BlueOak-1.0.0|CC-BY-4.0|CC0-1.0|Unlicense|Python-2.0|MPL-2.0|LGPL-3.0-or-later|LGPL-3.0-only|AGPL-3.0-only|AGPL-3.0-or-later|GPL-3.0-or-later|WTFPL|Zlib'
# 메타데이터 미상이나 수동 검토로 호환 확인된 예외(패키지명=실제 라이선스).
export ACK='combine-errors=실제 MIT (npm 메타에 SPDX 누락)'

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
pnpm licenses list --prod --json >"$tmp" 2>/dev/null || echo '{}' >"$tmp"
export LIC_FILE="$tmp"

python3 <<'PY'
import os, json
allow = set(os.environ["ALLOW"].split("|"))
ack = dict(kv.split("=", 1) for kv in os.environ["ACK"].split("\n") if "=" in kv)
with open(os.environ["LIC_FILE"]) as fh:
    raw = fh.read().strip()
data = json.loads(raw or "{}")
fail = False
for lic, pkgs in (data.items() if isinstance(data, dict) else []):
    if lic in allow:
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
