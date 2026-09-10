import type { Story, StoryAsset } from '@bebe/db-public'
import { describe, expect, it } from 'vitest'
import type { AssetWithUrls } from '../asset/types'
import { buildTimelineGroups } from './build-groups'
import type { TimelineItem } from './merged-list'

const asset = (id: string, takenAt: string): AssetWithUrls =>
  ({
    id,
    publicNo: Number(id.replace(/\D/g, '')) || 1,
    kind: 'image',
    status: 'ready',
    takenAt: new Date(takenAt),
    createdAt: new Date(takenAt),
    durationMs: null,
    urls: null,
  }) as unknown as AssetWithUrls

const assetItem = (a: AssetWithUrls): TimelineItem => ({
  kind: 'asset',
  ts: a.takenAt,
  id: a.id,
  asset: a,
})

const storyItem = (id: string, entryDate: string, assets: AssetWithUrls[]): TimelineItem => ({
  kind: 'story',
  ts: new Date(entryDate),
  id,
  entry: {
    id,
    publicNo: 1,
    title: null,
    body: 'b',
    mood: null,
    visibility: 'family',
    entryDate: new Date(entryDate),
    assets: assets.map(
      (a, i) =>
        ({ order: i, asset: a }) as unknown as StoryAsset & {
          asset: AssetWithUrls | null
        },
    ),
  } as unknown as Story & { assets: (StoryAsset & { asset: AssetWithUrls | null })[] },
})

const dayOfStories = (groups: ReturnType<typeof buildTimelineGroups>) =>
  groups.flatMap((g) => (g.stories ?? []).map((s) => `${g.dateKey}:${s.id}`))

describe('buildTimelineGroups — 스토리 카드 배치', () => {
  it('사진이 여러 날에 걸쳐도 스토리는 한 번만, 스토리 날짜 그룹에 붙는다', () => {
    const older = asset('a1', '2026-09-08T02:00:00Z')
    const older2 = asset('a2', '2026-09-08T03:00:00Z')
    const sameDay = asset('a3', '2026-09-09T01:00:00Z')
    const groups = buildTimelineGroups({
      items: [
        assetItem(sameDay),
        assetItem(older2),
        assetItem(older),
        storyItem('s1', '2026-09-09', [older, older2, sameDay]),
      ],
      birthDate: null,
      sortMode: 'taken',
    })
    // 예전엔 09-08 과 09-09 두 곳에 같은 카드가 붙어 중복으로 보였다.
    expect(dayOfStories(groups)).toEqual(['2026-09-09:s1'])
  })

  it('스토리 날짜에 사진이 없으면 사진이 있는 가장 최근 날로 — 카드가 사라지지 않게', () => {
    const a = asset('b1', '2026-09-08T02:00:00Z')
    const b = asset('b2', '2026-09-07T02:00:00Z')
    const groups = buildTimelineGroups({
      items: [assetItem(a), assetItem(b), storyItem('s2', '2026-09-20', [b, a])],
      birthDate: null,
      sortMode: 'taken',
    })
    expect(dayOfStories(groups)).toEqual(['2026-09-08:s2'])
  })

  it('사진이 하루에만 있으면 그대로 그 날에 붙는다', () => {
    const a = asset('c1', '2026-09-06T02:00:00Z')
    const groups = buildTimelineGroups({
      items: [assetItem(a), storyItem('s3', '2026-09-06', [a])],
      birthDate: null,
      sortMode: 'taken',
    })
    expect(dayOfStories(groups)).toEqual(['2026-09-06:s3'])
  })

  it('업로드순 모드에서는 업로드 날짜를 기준으로 판단한다', () => {
    const a = asset('d1', '2026-09-08T02:00:00Z')
    // 촬영은 09-08, 업로드는 09-09.
    const uploaded = { ...a, createdAt: new Date('2026-09-09T05:00:00Z') } as AssetWithUrls
    const groups = buildTimelineGroups({
      items: [
        { kind: 'asset', ts: uploaded.createdAt, id: uploaded.id, asset: uploaded },
        storyItem('s4', '2026-09-09', [uploaded]),
      ],
      birthDate: null,
      sortMode: 'uploaded',
    })
    expect(dayOfStories(groups)).toEqual(['2026-09-09:s4'])
  })
})
