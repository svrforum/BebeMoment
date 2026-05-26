import { existsSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'prisma/config'

// Prisma 7's config no longer auto-loads .env. Locally the repo keeps a single
// root .env (apps/web/.env is a symlink to it) — load it when present so
// `pnpm --filter @bebe/db-media migrate:dev/deploy` picks up DATABASE_URL.
// In Docker the var comes straight from the container env (no root .env), so
// the load is best-effort and never required.
const rootEnv = new URL('../../.env', import.meta.url).pathname
if (existsSync(rootEnv)) loadEnv({ path: rootEnv })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  // Direct process.env (NOT prisma's env() helper): env() throws during config
  // load when DATABASE_URL is unset, which breaks `prisma generate` in CI/Docker
  // builds that only need types. generate doesn't connect; migrate does and gets
  // the real url from the env.
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
})
