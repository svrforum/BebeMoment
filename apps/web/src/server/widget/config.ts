import { randomBytes } from 'node:crypto'
import type { PrismaClient } from '@bebe/db-public'

// 위젯 사진 소스. recent=전체 최신(기본·기존 동작), bookmark_random=북마크 랜덤,
// bookmark_pinned=북마크 중 고정 1장(pinnedAssetId).
export const WIDGET_SOURCES = ['recent', 'bookmark_random', 'bookmark_pinned'] as const
export type WidgetSource = (typeof WIDGET_SOURCES)[number]

export type WidgetConfig = { source: WidgetSource; pinnedAssetId: string | null }

function normalizeSource(v: string | null | undefined): WidgetSource {
  return WIDGET_SOURCES.includes(v as WidgetSource) ? (v as WidgetSource) : 'recent'
}

export async function getWidgetConfig(userId: string, prisma: PrismaClient): Promise<WidgetConfig> {
  const row = await prisma.widgetToken.findUnique({
    where: { userId },
    select: { widgetSource: true, widgetPinnedAssetId: true },
  })
  return {
    source: normalizeSource(row?.widgetSource),
    pinnedAssetId: row?.widgetPinnedAssetId ?? null,
  }
}

export async function setWidgetConfig(
  userId: string,
  input: { source: string; pinnedAssetId: string | null },
  prisma: PrismaClient,
): Promise<void> {
  const source = normalizeSource(input.source)
  // 고정 소스일 때만 pinned 를 저장(다른 소스로 바꾸면 비운다).
  const pinnedAssetId = source === 'bookmark_pinned' ? (input.pinnedAssetId ?? null) : null
  // 위젯 미설치(토큰 행 없음)여도 설정만 먼저 저장 — 토큰은 위젯 등록 때 재사용된다.
  await prisma.widgetToken.upsert({
    where: { userId },
    create: {
      token: randomBytes(32).toString('hex'),
      userId,
      widgetSource: source,
      widgetPinnedAssetId: pinnedAssetId,
    },
    update: { widgetSource: source, widgetPinnedAssetId: pinnedAssetId },
  })
}
