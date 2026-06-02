import type { PrismaClient } from '@bebe/db-public'

/**
 * 현재 사용자의 멤버십에 `last_seen_at = NOW()` 를 찍는다.
 *
 * 타임라인 진입 직후 호출 → 다음 방문 때 "여기까지 봤어요" 디바이더의 기준점이
 * 된다. 호출 전에 OLD 값을 읽어둬야 이번 렌더에서 디바이더를 그릴 수 있다.
 *
 * 멤버십 업데이트 where 는 tenant 미들웨어(§8) 가 통과시키는 compound 키
 * (`familyId_userId`) 를 쓴다. by-id 업데이트는 미들웨어가 dev 에서 throw.
 */
const TOUCH_DEBOUNCE_MS = 60_000

export async function touchLastSeen(
  membership: { id: string; familyId: string; userId: string; lastSeenAt?: Date | null },
  prismaPublic: PrismaClient,
): Promise<void> {
  // 매 렌더 write 금지 — 60초 내 재방문이면 생략(타임라인은 최다 진입 페이지라
  // 새로고침마다 row write + 인덱스 갱신이 누적됐다). 디바이더 기준점은 세션 단위 갱신이면 충분.
  if (membership.lastSeenAt && Date.now() - membership.lastSeenAt.getTime() < TOUCH_DEBOUNCE_MS) {
    return
  }
  await prismaPublic.membership.update({
    where: { familyId_userId: { familyId: membership.familyId, userId: membership.userId } },
    data: { lastSeenAt: new Date() },
  })
}
