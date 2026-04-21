# Operations Guide

## SECRET_KEY rotation

**SECRET_KEY** is used for:
1. AES-GCM key (via SHA-256 KDF) for encrypting OIDC `client_secret` and SMTP password at rest
2. Input to Lucia session cookie signing (via `sessionExpiresIn` default)

### Impact of rotation

- **All existing sessions are invalidated** (users must log in again) — safe.
- **Encrypted secrets in DB become un-decryptable** — OIDC and SMTP will fail until re-entered.

### Rotation procedure

1. Announce maintenance window.
2. Generate new key: `openssl rand -hex 32`
3. Before restarting: log in as admin, go to `/admin/auth/providers` and record OIDC `client_secret` values for each provider (can't retrieve from DB post-rotation; you need them from IdP side).
4. Log in to `/admin/smtp` — note SMTP password source (likely in your password manager).
5. Update `.env` with new `SECRET_KEY`.
6. Restart stack: `docker compose up -d`.
7. Log in, re-enter OIDC secrets on `/admin/auth/providers/[id]`, re-enter SMTP password on `/admin/smtp`.

### Automation (future)

Not yet implemented. If you need zero-downtime rotation, the roadmap is:
- Add `SECRET_KEY_PREVIOUS` env for decrypt fallback during transition
- Add key-version byte to ciphertext format
- Migration script re-encrypts all rows under new key

## Migration failure recovery

On startup, `docker/entrypoint.sh` runs `prisma migrate deploy`. If it fails, the container exits non-zero and `restart: unless-stopped` loops.

### Diagnose

```bash
docker compose logs web | tail -50
```

Look for `P3009` (migration failed), `P3005` (DB schema drift), or connection errors.

### Recover

1. Stop the loop: `docker compose stop web`
2. Open a shell in a fresh container with DB access:
   ```bash
   docker compose run --rm --entrypoint sh web
   ```
3. Inspect state:
   ```bash
   npx prisma migrate status --schema=packages/db/prisma/schema.prisma
   ```
4. If a migration is marked failed, either:
   - **Roll back** (preferred): `prisma migrate resolve --rolled-back <migration_name>`
   - **Mark applied** (if partial but functional): `prisma migrate resolve --applied <migration_name>`
5. Restart: `docker compose up -d`.

### Prevention

- Test migrations locally before tagging a release.
- Keep schema changes additive (no column drops in hot-path tables).
- Back up `pg_dump` before upgrading across major version bumps.

## Backup strategy

Critical data:
- `./data` (or `/volume1/docker/bebe-moment/data`) — uploaded originals + derivatives
- `./pg` (or Synology equivalent) — Postgres data

Recommended:
- **Nightly `pg_dump`**: `docker compose exec -T postgres pg_dump -U bebe -Fc bebe > bebe-$(date +%F).dump`
- **Data folder snapshot**: `tar -czf data-$(date +%F).tar.gz ./data` — ideally to a different drive / offsite.
- Synology: Hyper Backup scheduled over the stack directory.

## TLS

The container serves HTTP on port 3000 only. **An external reverse proxy is required** for TLS:
- Linux: Caddy / Traefik / nginx — see `docs/deployment-linux.md`
- Synology: DSM → 제어판 → 로그인 포털 → 고급 → 리버스 프록시

## Logs

- Web: `docker compose logs -f web`
- Worker: `docker compose logs -f worker` — JSON lines via pino.
- Filter: `docker compose logs web | jq -r 'select(.level=="error")'`

Log levels controlled by `LOG_LEVEL` env (debug/info/warn/error).
