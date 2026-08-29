# Security Policy

Bebe Moment stores a family's private photos and videos, so we take security
seriously. Thank you for helping keep self-hosters safe.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately via GitHub's **["Report a vulnerability"](https://github.com/svrforum/BebeMoment/security/advisories/new)**
(Security → Advisories → Report a vulnerability). If that is unavailable, open a
minimal public issue that says only "security report — please open a private
channel" with no details, and we will follow up.

Please include, as far as you can:

- affected version / image tag (`docker inspect` → `APP_VERSION`, or the `v0.0.x` tag)
- a description and the impact (what an attacker can do)
- reproduction steps or a proof of concept
- whether it requires authentication, and which role (`owner` / `guardian` / `family`)
  or whether it is reachable unauthenticated (e.g. the public `/s/<token>` share routes)

We aim to acknowledge within **5 days** and to ship a fix or mitigation for
confirmed high-severity issues as promptly as we can. We will credit reporters
in the release notes unless you ask us not to.

## Supported versions

This is a fast-moving single-maintainer project. Security fixes land on the
**latest** release only — run the newest `:latest` / `v0.0.x` image and the
in-app/Android update prompt to stay current.

## Deploying safely (operator checklist)

Most real-world risk on a self-hosted instance comes from configuration, not
code. Before exposing your instance to the internet:

- **Generate strong, unique secrets.** Never ship the `.env.example`
  placeholders — they are public. Run `openssl rand -hex 32` for `SECRET_KEY`,
  `MEDIA_SERVICE_TOKEN`, `MEDIA_JWT_SECRET`, and the DB passwords. In production
  the app refuses to boot with a placeholder/low-entropy `SECRET_KEY`.
- **Complete first-run setup before exposing the URL publicly.** Registration is
  open until the first owner account exists, so the first visitor to a public URL
  could claim the owner/admin account. Set it up on `localhost`/LAN first, or set
  a one-time `SETUP_TOKEN` (see deployment docs).
- **Serve over HTTPS** (reverse proxy with TLS). The session cookie is only sent
  with the `Secure` flag when `PUBLIC_URL` is `https://`.
- **Do not expose Postgres/Redis** to the internet — only port `3000` (the app).
- **Keep `features.faces` off** unless you want the optional ML sidecar, and keep
  any OIDC/SMTP/S3/FCM integrations limited to what you need.

## Scope

In scope: the web app, media service, auth/permissions, the public share routes,
the container/compose deployment, and secret handling. Out of scope: issues that
require already having `owner`/admin on the instance, social-engineering, and
denial-of-service that requires authenticated abuse of your own family instance.
