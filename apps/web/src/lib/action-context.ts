import { type ReadyContext, getContext } from '@/server/context'
import { actionReject } from './with-action-log'

/** 결과 봉투를 돌려주는 액션용 — 미로그인은 401, 가족 없음은 400 으로 거절한다. */
export async function requireActionContext(): Promise<ReadyContext> {
  const ctx = await getContext()
  if (!ctx.user) throw actionReject(401, 'errors.unauthorized')
  if (!ctx.family || !ctx.membership) throw actionReject(400, 'errors.noFamily')
  return ctx as ReadyContext
}
