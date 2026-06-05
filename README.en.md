<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dark.png">
    <img src="docs/assets/banner-light.png" alt="Bebe Moment" width="520">
  </picture>
</p>

<p align="center">
  <b>A self-hosted baby photo journal — just for your family</b><br>
  Keep every photo, video, and milestone on your own server. No ads, no tracking, no subscription.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-3b82f6"></a>
  <a href="https://github.com/svrforum/bebe-moment/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/svrforum/bebe-moment?color=3b82f6"></a>
  <img alt="Platform" src="https://img.shields.io/badge/deploy-Docker%20%C2%B7%20Synology-3b82f6">
  <img alt="Android" src="https://img.shields.io/badge/app-PWA%20%C2%B7%20Android-3b82f6">
</p>

<p align="center">
  <a href="README.md">한국어</a> · <b>English</b>
</p>

---

## One instance = one family

**Bebe Moment** is a **self-hosted family baby photo journal**, inspired by Bebememo. Instead of trusting a cloud with your child's photos, you run it on **your own server** (a Synology NAS, a home Linux box, a VPS) and keep everything within the family.

- 🔒 **Your data on your server** — no third-party cloud upload, no ads, no tracking, no subscription
- 👨‍👩‍👧 **One instance = one family** — the first user (admin) sets up the family; everyone else joins **by invite link only**
- 🖼️ **Originals stay original** — your uploaded bytes are preserved as-is; compatibility conversion is optional
- 🏠 **Self-hosting first** — especially smooth on **Synology DSM**, just a few clicks

> The family boundary (`family_id`) is enforced throughout the codebase. Multi-tenant isolation stays as a safety net, but there is forever exactly one family per instance.

## ✨ Features

| | |
|---|---|
| 🗓️ **Timeline · Calendar** | Auto-sorted by capture date, browse by month/day |
| 🖼️ **Photo · Video viewer** | Fullscreen viewer, AVIF/WebP format negotiation, instant blurhash, smooth transitions |
| ❤️ **Social** | Likes · comments (mentions) · bookmarks — each toggleable |
| 📔 **Stories (diary)** | Capture the day's story alongside the photos |
| 📁 **Albums** | Nested albums · secret albums (role-based visibility) |
| 📏 **Growth log · Milestones** | Height/weight trends, first-steps moments |
| 💝 **Memories** | Photos & stories from "a year ago today", "a few months ago today" |
| 👤 **Face recognition (opt-in)** | Automatic per-person grouping — turn it on or off |
| 🔗 **Share links** | Token links for a photo/album/story/date (expiry & revoke; original download is family-only) |
| 🌐 **Localization** | Korean · English (switch in settings) |
| 🌙 **Dark mode · PWA** | Installable home-screen app + web push |
| 🔔 **Notifications** | New photos, comments, memories… — per-category, per-device |
| 👥 **Member management** | Roles (owner/guardian/family), configurable family permissions, suspend/reset |
| 🔐 **Auth** | Username-based login + OIDC SSO |
| 💾 **Backup · Restore** | Full & incremental bundles, remote S3 mirror, scheduler, in-app & CLI restore |

## 📱 Everywhere

- **Web / PWA** — open in a browser, "Add to Home Screen" for an installed-app feel, with web push notifications
- **Android app** — Capacitor-based, with **FCM push** + a **home-screen widget** (family photo slideshow). APKs on [Releases](https://github.com/svrforum/bebe-moment/releases)

## 🚀 Getting started (self-hosting)

Deployment topology is **app + postgres + redis** (3 containers). The web, media, and notification-worker run as **three processes in a single image**, exposing only port 3000.

- 🐳 **Plain Linux Docker** → [docs/deployment-linux.md](docs/deployment-linux.md)
- 🟦 **Synology DSM (Container Manager)** → [docs/deployment-synology.md](docs/deployment-synology.md)

On a tag push, GitHub Actions builds and pushes `ghcr.io/svrforum/bebe-moment/app:vX.Y.Z`. Currently **`linux/amd64` only** (`arm64` for ARM Synology is planned).

```yaml
# excerpt — see the deployment docs for the full setup
services:
  app:
    image: ghcr.io/svrforum/bebe-moment/app:latest
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgres://...
      REDIS_URL: redis://...
      SECRET_KEY: <32+ bytes>
      PUBLIC_URL: https://bebe.example.com
    # PUID/PGID, volumes (./data:/data), media secrets, etc. — see the docs
```

## 🛠️ Tech stack

**TypeScript** full-stack monorepo (pnpm workspaces) · **Next.js 16** (App Router · Turbopack) · **Postgres + Prisma 7** (driver adapter · tenant isolation) · **Redis + BullMQ** · **Better Auth** (bcryptjs) · **Fastify** (media: tus uploads · signed URLs · SSE · sharp/ffmpeg) · **Tailwind + shadcn/ui + framer-motion** · **next-intl** · **Capacitor** (Android). Tested with **vitest + testcontainers** (real Postgres).

## ❤️ Support

Bebe Moment is an **ad-free, subscription-free** personal open-source project. If it helps your family, a coffee goes a long way ☕

<p>
  <a href="https://buymeacoffee.com/svrforum"><img alt="Buy Me A Coffee" src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=%E2%98%95&slug=svrforum&button_colour=FFDD00&font_colour=000000&font_family=Inter&outline_colour=000000&coffee_colour=ffffff"></a>
</p>

- ⭐ **[Star the repo](https://github.com/svrforum/bebe-moment)** to help others discover it
- 🐛 Bug reports & feature ideas → [Issues](https://github.com/svrforum/bebe-moment/issues)
- The app links straight to these from **Settings → GitHub · Buy me a coffee**

## 👩‍💻 Development

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d   # Postgres + Redis

# Migrations — cross-schema FKs mean deploy, not migrate dev
DATABASE_URL=postgres://bebe:bebe@localhost:5432/bebe pnpm --filter @bebe/db-public exec prisma migrate deploy
DATABASE_URL=postgres://bebe:bebe@localhost:5432/bebe pnpm --filter @bebe/db-media  exec prisma migrate deploy
# Generate Prisma clients (generated output is gitignored — required before typecheck)
pnpm --filter @bebe/db-public exec prisma generate && pnpm --filter @bebe/db-media exec prisma generate

pnpm dev                                          # web + media together
```

Browser → http://localhost:3000 → sign up → onboarding → home. Verifying the upload pipeline needs both web and media running.

```bash
pnpm test        # vitest (+ testcontainers, real Postgres)
pnpm typecheck
pnpm lint
pnpm licenses:check   # check dependency licenses for AGPL compatibility
```

<details>
<summary>Monorepo layout</summary>

```
apps/
  web/            # Next.js 16 — UI + API + PWA + notification worker
  media/          # Fastify + BullMQ — tus uploads / signed URLs / SSE / EXIF & derivatives
packages/
  db-public/      # public-schema Prisma + tenant middleware
  db-media/       # media-schema Prisma + DB role migrations
  core/           # domain utils (age buckets, permission matrix, feature flags)
  config/         # zod env schema
  media-client/   # web → media HTTP client
  queue/          # shared Redis/BullMQ
  storage/        # storage adapters (local / S3)
android-app/      # Capacitor Android app (outside the pnpm workspace)
```
</details>

## 📄 License

**[GNU AGPL-3.0-only](LICENSE)** — Copyright © 2026 svrforum.

Free to use, modify, and self-host. However, if you **offer this code (or a modified version) as a network service**, you must publish your modified source under the same license (the AGPL network clause). This keeps the project open and prevents closed-source commercial forks / SaaS. Dependencies keep their own licenses (mostly MIT/Apache-2.0; check with `pnpm licenses:check`).
