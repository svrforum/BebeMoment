import { randomBytes } from 'node:crypto'
import type { PrismaClient } from '@bebe/db-public'

/**
 * 사용자별 위젯 토큰을 보장한다(있으면 반환, 없으면 생성). 네이티브 홈 위젯이 세션
 * 없이 `/api/widget/data` 를 호출할 때 쓰는 길고 무작위인 bearer 토큰. user-scoped
 * (§8 예외) — tenant 미적용. 취소는 행 삭제.
 */
export async function issueWidgetToken(userId: string, prisma: PrismaClient): Promise<string> {
  const existing = await prisma.widgetToken.findUnique({ where: { userId } })
  if (existing) return existing.token
  const token = randomBytes(32).toString('hex')
  const row = await prisma.widgetToken.upsert({
    where: { userId },
    create: { token, userId },
    update: {},
  })
  return row.token
}
