# Privacy — what leaves your server

Bebe Moment is self-hosted with **no analytics, no tracking, and no telemetry**.
A default install makes **no outbound calls** of your family's data. Everything
below is either off by default or only triggered by features you turn on.

## Outbound calls and when they happen

| Call | When | Discloses | How to avoid |
|------|------|-----------|--------------|
| **Update check** (GitHub Releases) | Android app / in-app update banner checks for a newer version | Your instance's existence + app version to GitHub | It only fetches the public releases list (no account data). Ignore the banner; the web app works without it. |
| **OIDC** (your identity provider) | Only if you add an OIDC login provider | Login/identity exchange with the IdP you chose | Don't configure OIDC. |
| **FCM** (Google) | Only if you set up Android push | Push tokens + notification payloads via Google | Use web push instead, or no push. |
| **SMTP** | Only if you configure email | Password-reset emails via your mail server | Don't configure SMTP. |
| **S3 / remote backup** | Only if `STORAGE_MODE=s3` or remote backup is enabled | Media / backups to the bucket you chose | Use local storage (default). |
| **Face-recognition model** | Only if `features.faces` is enabled | Downloads the model from the InsightFace model zoo once (no photos leave) | Keep faces off (default). Photos are processed locally by the `ml` sidecar; they never leave your server. |

No third party ever receives your photos or videos unless you point storage/backup
at one yourself.

## Logs

Server logs (pino JSON) may contain emails, usernames, IP addresses, and
filenames at `info` level. They stay on your host (Docker logs). Secrets
(passwords, tokens, keys) are redacted. Set `LOG_LEVEL=warn` to reduce what is
recorded, and configure Docker log rotation (see [operations.md](operations.md)).

## Getting your data out (and deleting it)

You own all the data; nothing locks you in:

- **Originals**: every uploaded photo/video, byte-for-byte, lives under your
  `./data` volume (`families/<id>/assets/<id>/original.*`). Copy that folder for a
  raw export.
- **Full backup**: Admin → Backup creates a single `.tar.zst` bundle (Postgres
  dump + all media) — a complete, portable export of the instance. See
  [operations.md](operations.md) for restore.
- **Deletion**: deleting the stack and its `./data`, `./pg`, `./redis` volumes
  removes everything. There is no copy anywhere else.
