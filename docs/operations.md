# Operations Guide

The production stack is a single **`app`** container (web + media + notifications
worker in one image) plus `postgres` and `redis`. Examples below use
`docker compose` (service name `app`); if you run the image with `docker run`,
the container is typically named `bebe-app` — substitute accordingly.

## Upgrading

1. Check the [Releases](https://github.com/svrforum/BebeMoment/releases) for the
   latest version and any breaking notes.
2. Pull and restart:
   ```bash
   docker compose pull app && docker compose up -d
   ```
   To pin a version instead of `latest`, set `TAG=v0.0.x` in your `.env`.
3. **Migrations run automatically on boot** (`prisma migrate deploy` for the
   `db-public` then `db-media` schema). Watch the logs once to confirm a clean
   start (see *Migration failure recovery* below).

Always have a current backup before upgrading across notable version jumps.
**Do not downgrade** to an older image after migrations have run — the old code
may not understand the newer schema. If you must roll back, restore a backup
taken on that older version.

## Backups

### Built-in (recommended)

The app has a backup system in **Admin → Backup** (`/admin/backup`): on-demand
and scheduled full/incremental backups that bundle a Postgres dump **and** the
`/data` media into a single `.tar.zst`, stored under `BACKUP_DIR` (mount it to a
host/Synology shared folder), with optional offsite copy to S3 and retention.

Restore from a bundle via the CLI (run a one-off container against the same DB):

```bash
docker compose run --rm app pnpm --filter @bebe/web exec tsx scripts/restore.ts <backup-id>
```

The restore verifies bundle integrity first and (for in-app restores) snapshots
the current DB before overwriting.

### Manual (alternative)

```bash
# Postgres
docker compose exec -T postgres pg_dump -U bebe -Fc bebe > bebe-$(date +%F).dump
# media files
tar -czf data-$(date +%F).tar.gz ./data   # ideally to a different drive / offsite
```

Synology: Hyper Backup over the stack directory works too — but the built-in
backup is consistent (DB + media captured together).

## SECRET_KEY rotation

`SECRET_KEY` is used for:
1. The AES-256-GCM key (via SHA-256 KDF) encrypting OIDC `client_secret`, SMTP
   password, the VAPID private key, and the FCM service account at rest.
2. Signing the Better Auth session cookie.

### Impact

- **All sessions are invalidated** — everyone logs in again (safe).
- **Encrypted secrets become un-decryptable** — OIDC / SMTP / push must be
  re-entered.

### Procedure

1. Announce a maintenance window.
2. Generate a new key: `openssl rand -hex 32`.
3. Before restarting, make sure you can re-supply each integration's secret
   (OIDC `client_secret` from the IdP, SMTP password from your password manager).
4. Update `SECRET_KEY` in `.env` and restart: `docker compose up -d`.
5. Re-enter OIDC secrets at `/admin/auth/providers/[id]`, SMTP at `/admin/smtp`,
   and re-enable push if used.

## Migration failure recovery

On startup the entrypoint runs `prisma migrate deploy` for both schemas. If it
fails, the container exits non-zero and `restart: unless-stopped` loops.

### Diagnose

```bash
docker compose logs app | tail -80
```

Look for `P3009` (migration failed) or connection errors.

### Recover

1. Stop the loop: `docker compose stop app`.
2. Open a shell with DB access:
   ```bash
   docker compose run --rm --entrypoint sh app
   ```
3. Check status (note the two split schemas):
   ```bash
   pnpm --filter @bebe/db-public exec prisma migrate status
   pnpm --filter @bebe/db-media  exec prisma migrate status
   ```
4. If a migration is marked failed, resolve it on the relevant schema:
   ```bash
   pnpm --filter @bebe/db-public exec prisma migrate resolve --rolled-back <name>
   # or, if it partially applied but the DB is consistent:
   pnpm --filter @bebe/db-public exec prisma migrate resolve --applied <name>
   ```
5. Restart: `docker compose up -d`.

### Prevention

- Keep schema changes additive; back up before major upgrades.
- Migrations are hand-written SQL (cross-schema FKs) — test them locally first.

## Maintenance scripts

One-off repairs that ship with the image. Run them inside the app container.

### Rebuild video capture dates

Videos uploaded before v0.0.80 carry the wrong date. They have no EXIF, so the
capture time fell through to the file's modified time — which the Android file
picker sets to the moment of upload, making "shot on" equal "uploaded on".
Newer uploads read the time out of the container metadata; this repairs the old ones.

```bash
# preview first — prints what it would change, writes nothing
docker exec -w /repo bebe-app pnpm --filter @bebe/media exec tsx \
  src/scripts/backfill-video-taken-at.ts --dry-run

# apply
docker exec -w /repo bebe-app pnpm --filter @bebe/media exec tsx \
  src/scripts/backfill-video-taken-at.ts
```

It reads each video's original and rewrites `taken_at` only when the file carries a
real capture time. Videos without that metadata, and any date you corrected by hand
(`taken_at_source = 'manual'`), are left alone. Set `TZ` correctly on the container —
MP4 stores UTC, and the script converts to the instance's local wall clock, so a wrong
`TZ` shifts every date by the offset.

## TLS / reverse proxy

The container serves **HTTP on port 3000 only** — an external reverse proxy
provides TLS. This matters for security: the session cookie is only sent with the
`Secure` flag when `PUBLIC_URL` is `https://`, so run behind HTTPS for any
internet-facing deploy.

- Linux: Caddy / Traefik / nginx — see [`deployment-linux.md`](deployment-linux.md).
- Synology: DSM → Control Panel → Login Portal → Advanced → Reverse Proxy. Enable
  WebSocket / increase the proxy read timeout so the live update stream (SSE) and
  large uploads aren't cut off.

## Logs & monitoring

```bash
docker compose logs -f app                      # web + media + worker (one container)
docker compose logs app | jq -r 'select(.level=="error")'   # pino JSON, errors only
```

- `LOG_LEVEL` (debug/info/warn/error) controls verbosity.
- The default Docker `json-file` log driver grows unbounded — set a rotation
  limit for a 24/7 server, e.g. in compose:
  ```yaml
  logging:
    driver: json-file
    options: { max-size: "10m", max-file: "5" }
  ```
- Health: `GET /api/health` is a **liveness** check (DB only) used by the
  container healthcheck. For monitoring, `GET /api/health?deep=1` is a
  **readiness** check that also pings the media service — use it to catch the
  "photos 500 but health green" case (usually missing `MEDIA_SERVICE_TOKEN` /
  `MEDIA_JWT_SECRET`).
