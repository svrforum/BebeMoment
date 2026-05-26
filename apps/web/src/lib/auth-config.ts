import { hashPassword, verifyPassword } from '@/lib/password'
import { prismaPublic } from '@/lib/db-init'
import type { PrismaClient } from '@bebe/db-public'
import { type BetterAuthOptions, betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30d, matches the old Lucia TTL.

function resolveBaseUrl(): string {
  return process.env.PUBLIC_URL ?? 'http://localhost:3000'
}

type BuildAuthOpts = {
  baseURL?: string
  secret?: string
  // nextCookies only works inside the Next request lifecycle; integration tests
  // drive the API directly and read Set-Cookie from returnHeaders instead.
  withNextCookies?: boolean
}

/**
 * Shared Better Auth config. Factored so integration tests can bind a test
 * Prisma client (testcontainers) using the exact same options the app uses.
 *
 * All four Better Auth models (user/session/account/verification) are
 * user-scoped, not family-scoped, so the public tenant middleware never trips
 * on them (TENANT_SCOPED_MODELS excludes them).
 */
export function buildAuth(prisma: PrismaClient, opts: BuildAuthOpts = {}) {
  const plugins: BetterAuthOptions['plugins'] = opts.withNextCookies ? [nextCookies()] : []
  return betterAuth({
    baseURL: opts.baseURL ?? resolveBaseUrl(),
    secret: opts.secret ?? process.env.SECRET_KEY,
    trustedOrigins: [opts.baseURL ?? resolveBaseUrl()],
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
      // bcryptjs only (ARM/Synology). Existing hashes were migrated into the
      // `account` table verbatim, so verify must use the same algorithm.
      password: {
        hash: (password) => hashPassword(password),
        verify: ({ hash, password }) => verifyPassword(password, hash),
      },
    },
    user: {
      modelName: 'user',
      fields: { name: 'displayName', image: 'avatarPath' },
    },
    session: {
      modelName: 'session',
      expiresIn: SESSION_TTL_SECONDS,
      updateAge: 60 * 60 * 24, // refresh once per day
      // Cookie cache OFF → additional fields are read fresh from the DB each
      // request, so onboarding's session.update({ currentFamilyId }) is
      // reflected immediately. The multi-tenancy boundary depends on this.
      additionalFields: {
        currentFamilyId: { type: 'string', required: false, input: false },
      },
    },
    advanced: {
      // Let Postgres generate ids. Every Better Auth table (user/session/
      // account/verification) has a `gen_random_uuid()` DEFAULT, so ids stay
      // native UUIDs and Better Auth never sends one.
      database: { generateId: false },
      cookiePrefix: 'bebe',
      // Explicit name overrides the prefix → cookie is exactly `session`
      // (with __Secure- prefix added automatically under https).
      cookies: { session_token: { name: 'session' } },
    },
    plugins,
  })
}

export const auth = buildAuth(prismaPublic as unknown as PrismaClient, { withNextCookies: true })

export type AuthSession = typeof auth.$Infer.Session.session
export type AuthUser = typeof auth.$Infer.Session.user
