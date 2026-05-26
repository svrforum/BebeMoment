import type { PrismaClient } from '@bebe/db-public'

const USERNAME_RE = /^[a-z0-9._-]{3,30}$/

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase()
}

export function isValidUsername(u: string): boolean {
  return USERNAME_RE.test(u)
}

export async function isUsernameTaken(raw: string, prisma: PrismaClient): Promise<boolean> {
  const username = normalizeUsername(raw)
  const existing = await prisma.user.findUnique({ where: { username } })
  return existing !== null
}
