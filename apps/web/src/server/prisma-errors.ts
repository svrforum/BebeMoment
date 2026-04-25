/**
 * Cross-package Prisma error duck-typing.
 *
 * `instanceof PrismaClientKnownRequestError` is unreliable across our
 * package boundary (db-public proxies the generated client, so the prototype
 * chain on the thrown error doesn't always match the imported class).
 * Prisma docs explicitly support reading `.code` directly as a fallback.
 */
export function isUniqueViolation(err: unknown): boolean {
  return hasCode(err, 'P2002')
}

export function isForeignKeyViolation(err: unknown): boolean {
  return hasCode(err, 'P2003')
}

export function isNotFound(err: unknown): boolean {
  return hasCode(err, 'P2025')
}

function hasCode(err: unknown, code: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === code
  )
}
