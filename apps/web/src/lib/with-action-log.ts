import { levelForStatus } from '@/lib/error-log'
import { logger } from '@/lib/logger'
import { ServiceError } from '@/server/error'
import { unstable_rethrow } from 'next/navigation'
import { ZodError } from 'zod'
import type { ActionFailure, ActionResult } from './action-result'

const CATALOG_KEY = /^[a-z][\w-]*(?:\.[\w-]+)+$/i

export function actionFailure(status: number, errorKey: string, message?: string): ActionFailure {
  return { ok: false, status, errorKey, ...(message !== undefined ? { message } : {}) }
}

/** 액션 안의 경계 검증이 던지는 예상된 거절. `errorKey` 는 카탈로그 전체 경로다. */
export class ActionRejection extends Error {
  readonly status: number
  readonly errorKey: string
  constructor(status: number, errorKey: string) {
    super(errorKey)
    this.name = 'ActionRejection'
    this.status = status
    this.errorKey = errorKey
  }
}

export function actionReject(status: number, errorKey: string): ActionRejection {
  return new ActionRejection(status, errorKey)
}

function expectedFailure(e: unknown): ActionFailure | null {
  if (e instanceof ActionRejection) return actionFailure(e.status, e.errorKey)
  // 서비스는 `errors` 네임스페이스 상대 키로 던진다(errorJson 과 같은 규약).
  if (e instanceof ServiceError) return actionFailure(e.status, `errors.${e.message}`)
  if (e instanceof ZodError) {
    const first = e.issues[0]?.message ?? ''
    return actionFailure(400, CATALOG_KEY.test(first) ? first : 'errors.invalidInput')
  }
  // 서비스가 `throw new Error('…')` 로 알리는 거절(권한·검증). TypeError·Prisma 에러 같은
  // 하위 클래스는 버그이므로 여기 안 잡히고 그대로 던져진다.
  if (e instanceof Error && Object.getPrototypeOf(e) === Error.prototype)
    return actionFailure(400, 'errors.badRequest', e.message)
  return null
}

/**
 * 서버 액션 본문을 감싸 예상된 거절은 `{ ok:false }` 로 돌려주고 warn 으로, 예상 밖 에러는
 * error 로 남긴 뒤 다시 던진다. 지금까지 14개 액션 중 로그를 남기는 곳이 하나도 없어서,
 * 사용자가 "안 돼요" 라고 해도 서버에선 무엇이 거절됐는지 알 길이 없었다.
 * `redirect()`/`notFound()` 가 던지는 Next 내부 에러는 그대로 통과시킨다.
 */
export async function withActionLog<T>(
  action: string,
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (e) {
    unstable_rethrow(e)
    const failure = expectedFailure(e)
    if (!failure) {
      const err = e instanceof Error ? e : new Error(String(e))
      logger.error(
        {
          action,
          err: err.message.slice(0, 300),
          stack: err.stack?.split('\n').slice(0, 6).join(' | ').slice(0, 600),
        },
        'action failed',
      )
      throw e
    }
    logger[levelForStatus(failure.status)](
      {
        action,
        status: failure.status,
        key: failure.errorKey,
        ...(failure.message ? { err: failure.message.slice(0, 300) } : {}),
      },
      'action rejected',
    )
    return failure
  }
}
