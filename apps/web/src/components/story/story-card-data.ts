import type { AssetWithUrls } from '@/server/asset/types'
import type { Story, StoryAsset } from '@bebe/db-public'
import type { AssetUrls } from '@bebe/media-client'

/**
 * 스토리 카드에 그릴 값들. 컴포넌트(story-card.tsx)와 분리해 둔다 — 타임라인 그룹
 * 빌더 같은 **서버 모듈이 이 매퍼만 필요한데 React 컴포넌트까지 끌고 오면**, 서버
 * 테스트가 JSX 를 파싱하지 못해 깨진다.
 */
export type StoryCardData = {
  id: string
  publicNo: number
  title: string | null
  body: string
  mood: string | null
  visibility: string
  /** 대표 썸네일 = 스토리의 첫 사진(order 0). 없으면 무드 이모지 폴백. */
  cover: AssetUrls | null
}

type StoryEntryLike = Story & {
  assets: (StoryAsset & { asset: AssetWithUrls | null })[]
}

export function storyCardDataFromEntry(entry: StoryEntryLike): StoryCardData {
  const cover =
    entry.assets
      .slice()
      .sort((a, b) => a.order - b.order)
      .find((ea) => ea.asset)?.asset?.urls ?? null
  return {
    id: entry.id,
    publicNo: entry.publicNo,
    title: entry.title ?? null,
    body: entry.body,
    mood: entry.mood ?? null,
    visibility: entry.visibility,
    cover,
  }
}
