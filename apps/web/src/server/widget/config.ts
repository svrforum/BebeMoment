import { randomBytes } from 'node:crypto'
import type { PrismaClient } from '@bebe/db-public'

// 위젯 사진 소스. recent=전체 최신(기본·기존 동작), bookmark_random=북마크 랜덤,
// collection=사용자가 위젯에 담은 사진들(widget_photos).
export const WIDGET_SOURCES = ['recent', 'bookmark_random', 'collection'] as const
export type WidgetSource = (typeof WIDGET_SOURCES)[number]

export type WidgetConfig = { source: WidgetSource }

function normalizeSource(v: string | null | undefined): WidgetSource {
  return WIDGET_SOURCES.includes(v as WidgetSource) ? (v as WidgetSource) : 'recent'
}

export async function getWidgetConfig(userId: string, prisma: PrismaClient): Promise<WidgetConfig> {
  const row = await prisma.widgetToken.findUnique({
    where: { userId },
    select: { widgetSource: true },
  })
  return { source: normalizeSource(row?.widgetSource) }
}

export async function setWidgetConfig(
  userId: string,
  input: { source: string },
  prisma: PrismaClient,
): Promise<void> {
  const source = normalizeSource(input.source)
  // 위젯 미설치(토큰 행 없음)여도 설정만 먼저 저장 — 토큰은 위젯 등록 때 재사용된다.
  await prisma.widgetToken.upsert({
    where: { userId },
    create: { token: randomBytes(32).toString('hex'), userId, widgetSource: source },
    update: { widgetSource: source },
  })
}
