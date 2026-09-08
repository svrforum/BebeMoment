# Operations Guide

The production stack is a single **`app`** container (web + media + notifications
worker in one image) plus `postgres` and `redis`. Examples below use
`docker compose` (service name `app`); if you run the image with `docker run`,
the container is typically named `bebe-app` — substitute accordingly.

The image ships no package manager: everything inside the container runs with
plain `node` (`docker/run-app.sh` for the three processes, `docker/entrypoint.sh`
for migrations). Commands in this guide are written that way — `pnpm` does not
exist in the container.

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
docker compose run --rm --entrypoint bebe-restore app <backup-id>
```

Run it with the app stopped — it overwrites the database and `/data` with the
backup's contents. The entrypoint drops to `PUID`/`PGID` so restored files keep
the ownership the app expects.

The restore verifies bundle integrity first and (for in-app restores) snapshots
the current DB before overwriting.

### Restore on a new machine from the remote bucket

When the old host is gone, the only copy is the S3 bucket and the new instance
has no settings yet. The CLI therefore reads the remote configuration from the
environment (nothing is looked up in the database):

```bash
# 1. Bring up postgres + redis only, with the new .env in place
docker compose up -d postgres redis

# 2. See what is in the bucket
docker compose run --rm --entrypoint bebe-restore \
  -e BACKUP_REMOTE_BUCKET=<bucket> \
  -e BACKUP_REMOTE_ACCESS_KEY=<access key> \
  -e BACKUP_REMOTE_SECRET_KEY=<secret key> \
  -e BACKUP_REMOTE_ENDPOINT=https://s3.example.com \
  -e BACKUP_REMOTE_REGION=us-east-1 \
  -e BACKUP_REMOTE_PREFIX=bebe \
  app --list-remote

# 3. Restore one (its whole chain — the full backup plus the incrementals up to
#    that id — is downloaded into BACKUP_DIR first, then restored)
docker compose run --rm --entrypoint bebe-restore \
  -e BACKUP_REMOTE_BUCKET=… -e BACKUP_REMOTE_ACCESS_KEY=… -e BACKUP_REMOTE_SECRET_KEY=… \
  -e BACKUP_REMOTE_ENDPOINT=… -e BACKUP_REMOTE_REGION=… -e BACKUP_REMOTE_PREFIX=… \
  app --from-remote <backup-id>

# 4. Start the app
docker compose up -d
```

`BACKUP_REMOTE_ENDPOINT`, `BACKUP_REMOTE_REGION` and `BACKUP_REMOTE_PREFIX` are
optional (AWS S3 needs no endpoint; the prefix is whatever you configured in
`/admin/backup`). If the bundle was created with **"include SECRET_KEY"**, the CLI
prints where it extracted the key — set that value as the container's
`SECRET_KEY` (otherwise the encrypted settings: OIDC, SMTP, FCM, push keys stay
unreadable), then delete the extracted file. Without the key in the bundle, use
the `SECRET_KEY` of the old instance.

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
   password, the VAPID private key, the FCM service account and the remote-backup
   S3 secret key at rest.
2. Signing the Better Auth session cookie.

### Impact

- **All sessions are invalidated** — everyone logs in again (safe).
- **Encrypted secrets become un-decryptable** — every integration secret must be
  re-entered.
- **Backups made with "include SECRET_KEY" carry the old key.** Restoring one of
  them later expects the *old* key. Take a fresh backup after rotating.

### Procedure

1. Announce a maintenance window.
2. Generate a new key: `openssl rand -hex 32`.
3. Before restarting, make sure you can re-supply each integration's secret
   (OIDC `client_secret` from the IdP, SMTP password from your password manager,
   the FCM service-account JSON from the Firebase console, the S3 secret key of
   the backup bucket).
4. Update `SECRET_KEY` in `.env` and restart: `docker compose up -d`.
5. Re-enter:
   - OIDC secrets at `/admin/auth/providers/[id]`
   - SMTP at `/admin/smtp`
   - the FCM service account at `/admin/notifications` (Android push)
   - the remote-backup S3 secret key at `/admin/backup`
   - web push: members re-enable notifications on their devices (the VAPID key
     pair is regenerated).
6. Run a full backup so a bundle with the new key exists.

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
2. Open a shell with DB access (the entrypoint is skipped, so no migration runs):
   ```bash
   docker compose run --rm --entrypoint sh app
   ```
3. Check status (note the two split schemas — the Prisma CLI is invoked with node
   from each package directory so it picks up that package's `prisma.config.ts`):
   ```bash
   cd /repo/packages/db-public && node node_modules/prisma/build/index.js migrate status
   cd /repo/packages/db-media  && node node_modules/prisma/build/index.js migrate status
   ```
4. If a migration is marked failed, resolve it on the relevant schema:
   ```bash
   cd /repo/packages/db-public
   node node_modules/prisma/build/index.js migrate resolve --rolled-back <name>
   # or, if it partially applied but the DB is consistent:
   node node_modules/prisma/build/index.js migrate resolve --applied <name>
   ```
5. Restart: `docker compose up -d`.

### Prevention

- Keep schema changes additive; back up before major upgrades.
- Migrations are hand-written SQL (cross-schema FKs) — test them locally first.

## Upgrading Postgres 16 → 17

The data directory format is not compatible across majors: a `pg17` image will
not start on a volume written by `pg16`. Dump with the app image's bundled
`pg_dump` (it ships `postgresql-client-17`, which can read a 16 server) and
restore into a fresh volume:

```bash
# 1. Stop the app so nothing writes; keep postgres (16) running
docker compose stop app

# 2. Dump through the app image (pg17 client) into the backups volume
docker compose run --rm --no-deps --entrypoint sh app -c \
  'pg_dump "$DATABASE_URL" -Fc -f /backups/pre-pg17.dump'

# 3. Stop postgres, move the old volume aside, switch the image tag to pg17
docker compose stop postgres
mv ./pg ./pg-16
#   compose/docker-compose.yml already says pgvector/pgvector:pg17; if you pinned
#   pg16 somewhere (docker-compose.dev.yml does), change it now.

# 4. Start the new postgres (initdb creates the roles/db from the env), then restore
docker compose up -d postgres
docker compose run --rm --no-deps --entrypoint sh app -c \
  'pg_restore --no-owner --role=bebe -d "$DATABASE_URL" /backups/pre-pg17.dump'

# 5. Start the app — its entrypoint re-creates the web/media roles' passwords and
#    runs any pending migrations
docker compose up -d
```

The `pgvector` extension is created by the restore (`CREATE EXTENSION` is part
of the dump); the `pgvector/pgvector:pg17` image has it available. Keep `./pg-16`
until you have used the new instance for a while, then delete it. The app's own
backup/restore (above) is an equivalent path if you prefer it.

## Maintenance scripts

One-off repairs that ship with the image. Run them inside the running app
container; all of them print what they touch, and support `--dry-run` where noted.

### Rebuild video capture dates

Videos uploaded before v0.0.80 carry the wrong date. They have no EXIF, so the
capture time fell through to the file's modified time — which the Android file
picker sets to the moment of upload, making "shot on" equal "uploaded on".
Newer uploads read the time out of the container metadata; this repairs the old ones.

```bash
# preview first — prints what it would change, writes nothing
docker exec -w /repo/apps/media bebe-app \
  node --import tsx src/scripts/backfill-video-taken-at.ts --dry-run

# apply
docker exec -w /repo/apps/media bebe-app \
  node --import tsx src/scripts/backfill-video-taken-at.ts
```

It reads each video's original and rewrites `taken_at` only when the file carries a
real capture time. Videos without that metadata, and any date you corrected by hand
(`taken_at_source = 'manual'`), are left alone. Set `TZ` correctly on the container —
MP4 stores UTC, and the script converts to the instance's local wall clock, so a wrong
`TZ` shifts every date by the offset.

### Rebuild the video playability verdict

The download/save button hands out the original video only when the app knows the
phone can play it; otherwise it serves the compatible `preview.mp4`. Videos uploaded
before that verdict existed have none, so an old 4:2:2 / 10-bit recording is still
saved as the original — a file that plays sound only on most phones. This script
probes each existing video once and stores the verdict.

```bash
docker exec -w /repo/apps/media bebe-app \
  node --import tsx src/scripts/backfill-video-playable.ts --dry-run
docker exec -w /repo/apps/media bebe-app \
  node --import tsx src/scripts/backfill-video-playable.ts
```

### Clear unrecoverable uploads

Uploads that were cut off before the original file landed can never finish: the
retry always fails the same way. **Admin → Storage** (`/admin/storage`) has a
"Clear unrecoverable photos" panel — *Check* counts them, *Move to trash* moves them
into the trash, where the normal retention (`/admin/retention`) deletes them for
good. Re-upload the photos if you still want them.

## TLS / reverse proxy

The container serves **HTTP on port 3000 only** — an external reverse proxy
provides TLS. This matters for security: the session cookie is only sent with the
`Secure` flag when `PUBLIC_URL` is `https://`, so run behind HTTPS for any
internet-facing deploy.

- Linux: Caddy / Traefik / nginx — see [`deployment-linux.md`](deployment-linux.md).
- Synology: DSM → Control Panel → Login Portal → Advanced → Reverse Proxy. Enable
  WebSocket / increase the proxy read timeout so the live update stream (SSE) and
  large uploads aren't cut off.
- `TRUST_PROXY` (default `true`) tells the app to read the client IP from
  `x-real-ip` / `x-forwarded-for` for login rate limiting. Set it to `false` only
  when port 3000 is exposed directly without a proxy — a forged header must not
  buy an attacker a fresh rate-limit bucket.

## Logs & monitoring

```bash
docker compose logs -f app                      # web + media + worker (one container)
docker compose logs app | jq -r 'select(.level=="error")'   # pino JSON, errors only
```

- `LOG_LEVEL` (debug/info/warn/error) controls verbosity.
- The shipped compose files rotate logs (`json-file`, 20 MB × 5 files per
  container) — most lines are media access logs, and without rotation the Docker
  log grows unbounded. If you start the image with `docker run`, pass
  `--log-opt max-size=20m --log-opt max-file=5`.
- Health: `GET /api/health` is a **liveness** check (DB only) used by the
  container healthcheck. For monitoring, `GET /api/health?deep=1` is a
  **readiness** check that also pings the media service — use it to catch the
  "photos 500 but health green" case (usually missing `MEDIA_SERVICE_TOKEN` /
  `MEDIA_JWT_SECRET`).
- Stopping the container: `docker compose stop` sends SIGTERM to all three
  processes; media finishes in-flight transcodes (up to `MEDIA_SHUTDOWN_GRACE_MS`),
  the supervisor waits up to `APP_SHUTDOWN_GRACE_S` and the compose file gives
  Docker a 60 s `stop_grace_period`. A clean stop logs `bebe-media shutting down`
  and exits 0.

## Tuning knobs

All optional. Variables in the *compose* rows are read by `compose/docker-compose.yml`
and must be set in `.env`; the others are container environment variables — add them
to the `app` service's `environment:` block (the shipped compose passes the ones marked
*passed*).

| Variable | Default | Read by | What it does |
|---|---|---|---|
| `APP_MEMORY_LIMIT` | `2560m` | compose | Memory limit of the `app` container (web + media + worker + sharp/ffmpeg). |
| `APP_HEAP_WEB_MB` | `768` | run-app.sh (passed) | Node `--max-old-space-size` for the web server. |
| `APP_HEAP_MEDIA_MB` | `640` | run-app.sh (passed) | Same for the media service; sharp/ffmpeg use memory outside this heap. |
| `APP_HEAP_WORKER_MB` | `256` | run-app.sh (passed) | Same for the notifications worker. |
| `APP_SHUTDOWN_GRACE_S` | `45` | run-app.sh | How long the supervisor waits for the three processes after SIGTERM before SIGKILL. Keep it below `stop_grace_period` (60 s) and above `MEDIA_SHUTDOWN_GRACE_MS`. |
| `UV_THREADPOOL_SIZE` | `8` (media only) | run-app.sh | libuv thread pool of the media process (fs, zlib, crypto). |
| `MEDIA_SHUTDOWN_GRACE_MS` | `30000` | media | Time given to in-flight thumbnail/transcode jobs on shutdown. |
| `MEDIA_CONCURRENCY_THUMBNAIL` | `3` | media | Photo derivative jobs processed in parallel. Lower on 2-core NAS boxes. |
| `MEDIA_FACES_CONCURRENCY` | `1` | media | Face-detection jobs sent to the `ml` sidecar in parallel. |
| `MEDIA_DERIVATIVES_INCLUDE_AVIF` | `true` | media (passed) | Generate AVIF derivatives besides WebP/JPEG. `false` roughly halves processing time on slow CPUs. |
| `MEDIA_MAX_UPLOAD_BYTES` | `5368709120` (5 GiB) | media | Per-file upload limit. |
| `MEDIA_FAMILY_QUOTA_BYTES` | `0` (unlimited) | media | Total storage allowed for the family. |
| `MEDIA_MAX_INPUT_PIXELS` | `64000000` | media | Images larger than this are rejected instead of decoded (memory guard). |
| `MEDIA_STALE_UPLOAD_HOURS` | `6` | media | An upload with no progress for this long is marked failed. |
| `MEDIA_STALE_PROCESSING_HOURS` | `12` | media | An asset stuck in `processing` this long is marked failed. |
| `MEDIA_ROLE` | `both` | media | `server`, `worker` or `both` — for running the media service split across containers. |
| `MEDIA_PORT` / `MEDIA_HOST` | `3001` / `0.0.0.0` | media | Internal listen address (the web rewrite targets `MEDIA_INTERNAL_URL`). |
| `MEDIA_INTERNAL_URL` | `http://localhost:3001` | web (passed) | Where the web server reaches media inside the container. |
| `MEDIA_PUBLIC_BASE_URL` / `NEXT_PUBLIC_MEDIA_BASE_URL` | unset (relative `/media/…`) | media / web (passed) | Absolute media base — only for a separate media host. |
| `MEDIA_URL_CACHE` | on (`off` disables) | web | Web-side cache of signed media URLs. |
| `SSE_MAX_PER_USER` | `5` | web | Concurrent upload-progress streams per user; more get 429. |
| `OIDC_ALLOW_LOCAL_FETCH` | unset (`false`) | web | Allow OIDC discovery/JWKS on private or loopback addresses (an IdP on the LAN). Off, the SSRF guard blocks them. |
| `SHARE_ALLOWED_HOSTS` | unset | web (passed) | Extra hosts (comma-separated) trusted for absolute share/preview URLs when `PUBLIC_URL` is a LAN address. |
| `TRUST_PROXY` | `true` | web (passed) | Trust `x-real-ip` / `x-forwarded-for` for the client IP. |
| `SETUP_TOKEN` | unset | web (passed) | Required for the first signup when set (`/signup?setup=…`). |
| `BACKUP_DIR` | `/backups` | web (passed) | Where backup bundles are written inside the container. |
| `FACE_ML_URL` | `http://ml:8000` | media/web (passed) | The face-recognition sidecar. |
| `PG_MEMORY_LIMIT` | `512m` | compose | Memory limit of the `postgres` container. |
| `PG_SHARED_BUFFERS` | `256MB` | compose | Postgres `shared_buffers`; about a quarter to half of `PG_MEMORY_LIMIT`. |
| `PG_EFFECTIVE_CACHE` | `768MB` | compose | Postgres `effective_cache_size` (planner hint: limit + OS cache). |
| `PG_WORK_MEM` | `8MB` | compose | Postgres `work_mem` per sort/hash. |
| `REDIS_MEMORY_LIMIT` | `128m` | compose | Memory limit of the `redis` (Valkey) container; `maxmemory` inside is 96 MB with `noeviction`. |

The media workstream is registering its `MEDIA_*` knobs in the shared env schema
(`packages/config/src/env.ts`) and adds `MEDIA_AVIF_EFFORT`, `MEDIA_VIPS_THREADS`
and `MEDIA_CONCURRENCY_VIDEO`; check that file for the authoritative list and
defaults if this table and the code disagree.
