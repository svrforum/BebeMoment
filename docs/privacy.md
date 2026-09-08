# Privacy — what leaves your server

Bebe Moment is self-hosted with **no analytics, no tracking, and no telemetry**.
A default install sends **none of your family's data** anywhere. The container
makes no calls at boot: Prisma's version check is disabled (`CHECKPOINT_DISABLE=1`)
and no package manager runs at start. The server contacts a third party only in
the cases below — most of them only after you turn a feature on.

## Outbound calls and when they happen

| Call | When | Discloses | How to avoid |
|------|------|-----------|--------------|
| **Update check** (`api.github.com`) | The web **server** looks up the latest Android release when a signed-in member opens Settings → App (the update banner / "check for updates"). Cached for 30 minutes, so a household shares one request. | Your server's IP and a request for the public releases list — no account or family data. | Don't open that section, or block egress to `api.github.com`; the app works without it. |
| **APK download** (`github.com`) | Only when someone taps *Update* in the Android app — the APK comes from GitHub Releases. | The phone's IP to GitHub. | Install updates from your own copy of the APK instead. |
| **Web push** (the browser's push service: Google, Apple or Mozilla) | Only after a member enables notifications in their browser/PWA. | The push endpoint the browser registered plus an **end-to-end encrypted** payload — the push service sees ciphertext, not the notification text or photos. | Keep notifications off. Web push needs no Google account or FCM setup on your side. |
| **FCM** (Google) | Only if you configure the Android app's push (service-account JSON at `/admin/notifications`). | Device tokens + notification payloads via Google. | Use web push (above) or no push. |
| **OIDC** (your identity provider) | Only if you add an OIDC login provider. | Login/identity exchange with the IdP you chose. | Don't configure OIDC. |
| **SMTP** | Only if you configure email. | Password-reset emails via your mail server. | Don't configure SMTP. |
| **S3 / remote backup** | Only if `STORAGE_MODE=s3` or remote backup is enabled. | Media / backup bundles to the bucket you chose. | Use local storage (default). |
| **Face-recognition model** | Only if you run the optional `ml` sidecar (`features.faces`). | The sidecar downloads the InsightFace model pack once (no photos leave). | Keep faces off (default). Photos are processed locally by the sidecar; they never leave your server. |

No third party ever receives your photos or videos unless you point storage/backup
at one yourself.

## Logs

Server logs (pino JSON) may contain emails, usernames, IP addresses, and
filenames at `info` level. They stay on your host (Docker logs). Secrets
(passwords, tokens, keys) are redacted. Set `LOG_LEVEL=warn` to reduce what is
recorded; the shipped compose files rotate the Docker logs (see
[operations.md](operations.md)).

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
