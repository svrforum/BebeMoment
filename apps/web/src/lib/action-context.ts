import { type Context, getContext } from '@/server/context'
import { actionReject } from './with-action-log'

export type ReadyContext = Context & {
  user: NonNullable<Context['user']>
  family: NonNullable<Context['family']>
  membership: NonNullable<Context['membership']>
}

/** 결과 봉투를 돌려주는 액션용 — 미로그인은 401, 가족 없음은 400 으로 거절한다. */
export async function requireActionContext(): Promise<ReadyContext> {
  const ctx = await getContext()
  if (!ctx.user) throw actionReject(401, 'errors.unauthorized')
  if (!ctx.family || !ctx.membership) throw actionReject(400, 'errors.noFamily')
  return ctx as ReadyContext
}
