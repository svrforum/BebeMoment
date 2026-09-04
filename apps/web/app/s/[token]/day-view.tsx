import type { DayPreview } from '@/server/share/day-preview'
import { ShareViewFrame, appDeepLink } from './share-frame'
import { StoryPreviewBlock } from './story-view'

/**
 * 하루 공유의 공개 뷰 — 스토리 공유와 같은 틀. 그 날 스토리마다 대표사진·글·잠긴 나머지를
 * 반복하고, 어느 스토리에도 안 담긴 사진은 잠긴 타일로만 알린다(스토리가 없으면 첫 사진이
 * 대표). 전체는 앱/로그인에서 — 링크만으로 그 날 사진을 다 보여주지 않는다.
 */
export async function DayShareView({
  p,
  date,
  meta,
  base,
}: {
  p: DayPreview
  date: string
  meta: string
  base: string
}) {
  const path = `/timeline?date=${date}`
  const webUrl = `${base}${path}`
  const appHref = appDeepLink(base, path, webUrl)
  const noStories = p.stories.length === 0

  return (
    <ShareViewFrame familyName={p.photos.familyName} meta={meta} appHref={appHref} webUrl={webUrl}>
      {p.stories.map((s) => (
        <StoryPreviewBlock
          key={s.id}
          imageUrl={s.coverUrl}
          badgeTotal={s.totalPhotos}
          body={s.body}
          lockedCount={s.totalPhotos > 1 ? s.totalPhotos - 1 : 0}
          moreHref={`${base}/story/${s.publicNo}`}
        />
      ))}
      {p.loosePhotos > 0 && (
        <StoryPreviewBlock
          imageUrl={noStories ? p.looseCoverUrl : null}
          badgeTotal={p.loosePhotos}
          body=""
          lockedCount={noStories ? p.loosePhotos - 1 : p.loosePhotos}
          moreHref={webUrl}
        />
      )}
    </ShareViewFrame>
  )
}
