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
pnpm test        # vitest; needs Docker for testcontainers
```

CI runs the same gate. Note that CI does **not** run `next build`, so if you
touch `next.config.mjs`, `proxy.ts`, routing, or CSP, also run
`pnpm --filter @bebe/web build` locally — those errors only surface at build
time.

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
(`public` → `media`) that break the shadow-database step. Write the migration SQL
by hand:

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
