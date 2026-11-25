# Contributing to Bebe Moment

Thanks for your interest! This is a self-hosted family photo journal — a pnpm
monorepo of a Next.js web app, a Fastify media service, and shared packages.

## Prerequisites

- **Node 22+** and **pnpm 11** (`corepack enable` picks up the pinned version)
- **Docker** — required to run the test suite (integration tests use
  [testcontainers](https://testcontainers.com/) to spin up a real Postgres) and
  for the local dev database

## Local setup

```bash
pnpm install

# dev database (Postgres + Redis)
docker compose -f docker-compose.dev.yml up -d

# generate Prisma clients (the generated code is gitignored, so this is required
# before typecheck/test on a fresh checkout)
pnpm --filter @bebe/db-public exec prisma generate
pnpm --filter @bebe/db-media  exec prisma generate

# apply migrations
DATABASE_URL=postgres://bebe:bebe@localhost:5432/bebe \
  pnpm --filter @bebe/db-public exec prisma migrate deploy
DATABASE_URL=postgres://bebe:bebe@localhost:5432/bebe \
  pnpm --filter @bebe/db-media  exec prisma migrate deploy

# copy env and fill it in (dev placeholders are fine for local; production
# rejects placeholder secrets)
cp .env.example .env

# run the web app
pnpm --filter @bebe/web dev
```

## Checks (run before pushing)

```bash
pnpm lint        # biome
pnpm typecheck
pnpm check:lines # source files must stay under the line limit (1000 warn / 1500 hard)
scripts/check-compose-doc-env.sh  # the Synology guide's compose block matches compose/docker-compose.yml
pnpm test        # vitest; needs Docker for testcontainers
```

CI runs the same checks, then `pnpm --filter @bebe/web build` and the Playwright
smoke tests (`bash e2e/scripts/run-smoke.sh`, which starts its own throwaway
Postgres/Redis on separate ports). Running the build locally is still the quickest
way to see errors from `next.config.mjs`, `proxy.ts`, routing or CSP, which lint
and typecheck miss. When `docker/`, `apps/ml/`, `.dockerignore`, `package.json`,
`pnpm-lock.yaml` or `pnpm-workspace.yaml` change, CI also builds both images
(without pushing them), but it never starts them. So if you change `docker/`
(Dockerfile, entrypoint, `run-app.sh`), start the image yourself and check that
`/api/health` answers and that a page with photos loads.

## Conventions

- **TypeScript strict**, no `any` (use `unknown` + narrowing). Public functions
  get explicit return types. Biome enforces formatting and `import type`.
- **Tests first** for features and bug fixes. Integration tests use a real
  Postgres via testcontainers — don't mock the database.
- **Domain-centric layout**: business logic lives in
  `apps/web/src/server/<domain>/<verb>.ts` as pure functions that take a Prisma
  client as an argument; API routes are thin adapters (auth → validate → call →
  respond). Validate input with zod at the boundary.
- **i18n**: user-facing strings go in `apps/web/messages/{ko,en}.json` (keep ko/en
  in parity); use `useTranslations`/`getTranslations`, not hardcoded literals.
- **No silent failures** — surface upload/worker errors in the UI; don't swallow.

## Database migrations

`prisma migrate dev` does **not** work here — there are cross-schema foreign keys
(`media` tables reference `public` ones: `media.assets` → `public.families` /
`public.users`, `media.asset_babies` → `public.babies` / `public.users`) that break the
shadow-database step. Write the migration SQL by hand:

```bash
# create migrations/<timestamp>_<name>/migration.sql with same-schema FKs only, then:
DATABASE_URL=postgres://bebe:bebe@localhost:5432/bebe \
  pnpm --filter @bebe/db-public exec prisma migrate deploy
pnpm --filter @bebe/db-public exec prisma generate
```

New family-scoped tables must include `family_id` and be added to the schema's
`TENANT_SCOPED_MODELS` list (the tenant-isolation middleware). User-scoped tables
(sessions, push subscriptions, …) are the exception.

## Commits & pull requests

- **Conventional Commits**: `feat(scope): …`, `fix(scope): …`, `docs: …`,
  `chore: …`, `test: …`, `refactor(scope): …`. Present tense.
- One commit per logical change; keep tests with the implementation.
- Open a PR against `main`. Describe what and why; link any related issue.

## Reporting bugs / security

Bugs: open a GitHub issue with repro steps, version, and logs. **Security
vulnerabilities: do not open a public issue** — see [SECURITY.md](SECURITY.md).
