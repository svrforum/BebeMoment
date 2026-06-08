import type { PrismaClient as PrismaPublic } from '@bebe/db-public'

type JobLike = {
  type: string
  familyId: string
  payload: Record<string, string | undefined>
}

/**
 * 알림 잡의 수신자 가시성('family' | 'guardians')을 **권위 있게** 결정한다.
 *
 * 스토리 알림(`diary.created`)은 payload 의 visibility 문자열을 그대로 믿지 않고
 * DB 의 `story.visibility` 를 발송 시점에 다시 읽는다. 이렇게 해야:
 *  - payload 가 누락/변조돼도 family 전원에게 새는 fail-open 을 막고,
 *  - enqueue 이후 비밀↔공개로 전환된 in-flight 변경이 최신 값으로 반영된다.
 * 스토리가 그새 삭제돼 못 찾으면 payload 값으로 폴백한다.
 *
 * 성장/마일스톤 등 가시성 컬럼이 없는(항상 guardians 고정) 이벤트는 payload 를 신뢰한다.
 */
export async function resolveNotificationVisibility(
  job: JobLike,
  prismaPublic: PrismaPublic,
): Promise<'family' | 'guardians'> {
  const fromPayload = job.payload.visibility === 'guardians' ? 'guardians' : 'family'
  if (job.type === 'diary.created' && job.payload.entryId) {
    const story = await prismaPublic.story.findFirst({
      where: { id: job.payload.entryId, familyId: job.familyId, deletedAt: null },
      select: { visibility: true },
    })
    if (story) return story.visibility === 'guardians' ? 'guardians' : 'family'
  }
  return fromPayload
}
