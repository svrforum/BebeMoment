import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

export class MediaHttpError extends Error {
  readonly code: string
  readonly status: number
  readonly retriable: boolean
  readonly details?: Record<string, unknown>
  constructor(args: {
    code: string
    status: number
    message: string
    retriable: boolean
    details?: Record<string, unknown>
  }) {
    super(args.message)
    this.code = args.code
    this.status = args.status
    this.retriable = args.retriable
    if (args.details !== undefined) this.details = args.details
  }
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    req.log.warn({ err, code: (err as MediaHttpError).code }, 'http error')

    if (err instanceof MediaHttpError) {
      return reply.status(err.status).send({
        error: {
          code: err.code,
          message: err.message,
          retriable: err.retriable,
          details: err.details,
        },
      })
    }

    if (err instanceof z.ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: '요청 형식이 올바르지 않아요',
          retriable: false,
          details: { issues: err.issues },
        },
      })
    }

    return reply.status(500).send({
      error: {
        code: 'INTERNAL',
        message: '서버 오류가 발생했어요',
        retriable: false,
      },
    })
  })
}
