#!/usr/bin/env python3
"""i18n 카탈로그 머지 — 페이즈 에이전트가 돌려준 네임스페이스 카탈로그({ko,en})를
messages/{ko,en}.json 의 해당 네임스페이스 키 아래에 병합한다.
사용: python scripts/merge-i18n.py <namespace> <file-with-{ko,en}.json> [...반복]
인자는 (namespace, file) 쌍의 반복."""
import json
import sys
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MSG = ROOT / "apps" / "web" / "messages"


def load(p):
    return json.loads(p.read_text())


def dump(p, data):
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def deep_merge(dst, src):
    """src 를 dst 에 재귀 병합(중첩 dict 는 병합, 리프는 src 로 덮어씀)."""
    for k, v in src.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            deep_merge(dst[k], v)
        else:
            dst[k] = v
    return dst


def main(argv):
    if len(argv) < 2 or len(argv) % 2 != 0:
        print("usage: merge-i18n.py <ns> <file> [<ns> <file> ...]")
        return 1
    ko = load(MSG / "ko.json")
    en = load(MSG / "en.json")
    pairs = list(zip(argv[0::2], argv[1::2]))
    for ns, fpath in pairs:
        cat = load(Path(fpath))
        if "ko" not in cat or "en" not in cat:
            print(f"✗ {fpath}: missing ko/en")
            return 1
        deep_merge(ko.setdefault(ns, {}), cat["ko"])
        deep_merge(en.setdefault(ns, {}), cat["en"])
        print(f"✓ merged namespace '{ns}' from {fpath}")
    dump(MSG / "ko.json", ko)
    dump(MSG / "en.json", en)
    # 키 구조 일치 검증(ko/en 같은 키여야 누락 없음)
    def keys(d, prefix=""):
        out = set()
        for k, v in d.items():
            kk = f"{prefix}{k}"
            if isinstance(v, dict):
                out |= keys(v, kk + ".")
            else:
                out.add(kk)
        return out
    miss = keys(ko) ^ keys(en)
    if miss:
        print(f"⚠️  ko/en 키 불일치: {sorted(miss)[:10]}")
        return 1
    print("✓ ko/en 키 구조 일치")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
