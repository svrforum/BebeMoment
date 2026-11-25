/**
 * Typed error surface for service-layer throws.
 *
 * API routes should `instanceof ServiceError` and read `.status` to map
 * to the right HTTP code. Plain `throw new Error(...)` keeps the existing
 * 400 fallback for backwards compat.
 *
 * `message` is an `errors` catalog key; `values` fills its ICU placeholders
 * (`{count}`) when errorJson / withActionLog translate it for the request locale.
 */
export type ErrorValues = Record<string, string | number>

export class ServiceError extends Error {
  readonly status: number
  readonly values: ErrorValues | undefined
  constructor(status: number, message: string, values?: ErrorValues) {
    super(message)
    this.name = 'ServiceError'
    this.status = status
    this.values = values
  }
}

export class NotFoundError extends ServiceError {
  constructor(message: string, values?: ErrorValues) {
    super(404, message, values)
    this.name = 'NotFoundError'
  }
}

export class ForbiddenError extends ServiceError {
  constructor(message: string, values?: ErrorValues) {
    super(403, message, values)
    this.name = 'ForbiddenError'
  }
}

export class ConflictError extends ServiceError {
  constructor(message: string, values?: ErrorValues) {
    super(409, message, values)
    this.name = 'ConflictError'
  }
}

/** Map any error to (status, message, values) for JSON responses. */
export function toHttpError(err: unknown): {
  status: number
  message: string
  values?: ErrorValues
} {
  if (err instanceof ServiceError) {
    return {
      status: err.status,
      message: err.message,
      ...(err.values ? { values: err.values } : {}),
    }
  }
  if (err instanceof Error) {
    return { status: 400, message: err.message }
  }
  return { status: 400, message: 'Unknown error' }
}
