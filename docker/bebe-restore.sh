#!/usr/bin/env bash
# 백업 복구 진입점. `docker compose run --rm --entrypoint bebe-restore app <backup-id>`.
# 돌아가는 앱이 없는 상태에서 실행할 것(이 명령은 DB·스토리지를 백업 시점으로 덮어쓴다).
# PUID/PGID 로 내려가 /data·/backups 소유권과 맞춘다.
# 이미지에 pnpm 이 없으므로 apps/web 에서 node + tsx 로더로 직접 실행한다.
set -euo pipefail
cd /repo/apps/web
exec gosu "${PUID:-1000}:${PGID:-1000}" node --import tsx scripts/restore.ts "$@"
