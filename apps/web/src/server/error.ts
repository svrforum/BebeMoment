/**
 * Typed error surface for service-layer throws.
 *
 * API routes should `instanceof ServiceError` and read `.status` to map
 * to the right HTTP code. Plain `throw new Error(...)` keeps the existing
 * 400 fallback for backwards compat.
 */
export class ServiceError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ServiceError'
    this.status = status
  }
}

export class NotFoundError extends ServiceError {
  constructor(message: string) {
    super(404, message)
    this.name = 'NotFoundError'
  }
}

export class ForbiddenError extends ServiceError {
  constructor(message: string) {
    super(403, message)
    this.name = 'ForbiddenError'
  }
}

export class ConflictError extends ServiceError {
  constructor(message: string) {
    super(409, message)
    this.name = 'ConflictError'
  }
}

/** Map any error to (status, message) for JSON responses. */
export function toHttpError(err: unknown): { status: number; message: string } {
  if (err instanceof ServiceError) {
    return { status: err.status, message: err.message }
  }
  if (err instanceof Error) {
    return { status: 400, message: err.message }
  }
  return { status: 400, message: 'Unknown error' }
}
