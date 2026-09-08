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

/**
 * 사용자의 위젯 토큰을 전부 지운다 — 로그아웃·비밀번호 재설정·정지 때. 세션만 지우면 위젯
 * bearer 토큰은 영원히 살아 있어, 기기를 잃어버리거나 계정을 잠가도 위젯이 계속 사진을 받았다.
 * 위젯은 다음 앱 실행 때 새 토큰을 발급받는다.
 */
export async function revokeWidgetTokens(userId: string, prisma: PrismaClient): Promise<number> {
  const { count } = await prisma.widgetToken.deleteMany({ where: { userId } })
  return count
}

export const WIDGET_TOKEN_IDLE_DAYS = 90

/**
 * 90일 동안 쓰이지 않은 위젯 토큰 정리(일일 유지보수). 한 번도 쓰이지 않은 토큰은 발급일 기준.
 * 살아 있는 위젯은 매일 데이터를 받아 lastUsedAt 을 갱신하므로 걸리지 않는다.
 */
export async function purgeStaleWidgetTokens(now: Date, prisma: PrismaClient): Promise<number> {
  const cutoff = new Date(now.getTime() - WIDGET_TOKEN_IDLE_DAYS * 24 * 60 * 60 * 1000)
  const { count } = await prisma.widgetToken.deleteMany({
    where: {
      OR: [{ lastUsedAt: { lt: cutoff } }, { lastUsedAt: null, createdAt: { lt: cutoff } }],
    },
  })
  return count
}
