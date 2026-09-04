import type { PublicStoryPreview } from '@/server/share/public-story'
import { Lock } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { ShareViewFrame, appDeepLink } from './share-frame'

/**
 * 스토리 하나의 공개 미리보기 — 대표사진(+ "1 / N" 배지) · 글 · 잠긴 나머지 타일. 스토리 공유와
 * 하루 공유(스토리마다 반복)가 같은 블록을 쓴다. lockedCount 는 잠긴 타일로 알릴 사진 수.
 */
export async function StoryPreviewBlock({
  imageUrl,
  badgeTotal,
  body,
  lockedCount,
  moreHref,
}: {
  imageUrl: string | null
  badgeTotal: number
  body: string
  lockedCount: number
  moreHref: string
}) {
  const t = await getTranslations('share')
  const lockedTiles = ['a', 'b', 'c', 'd'].slice(0, Math.min(lockedCount, 4))
  return (
    <>
      {imageUrl && (
        <div className="relative mt-4">
          {/* biome-ignore lint/performance/noImgElement: 공개 랜딩의 단일 signed URL — PictureImage(클라) 불필요 */}
          <img src={imageUrl} alt="" className="w-full rounded-2xl object-cover shadow-card" />
          {badgeTotal > 1 && (
            <span className="absolute left-2.5 top-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm">
              1 / {badgeTotal}
            </span>
          )}
        </div>
      )}

      {body.trim() && (
        <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-base-800 dark:text-base-200">
          {body}
        </p>
      )}

      {lockedCount > 0 && (
        <a
          href={moreHref}
          className="mt-5 block rounded-2xl border border-base-200/70 bg-base-0 p-4 transition active:scale-[0.99] dark:border-base-800/70 dark:bg-base-900"
        >
          <div className="grid grid-cols-4 gap-2">
            {lockedTiles.map((k) => (
              <div
                key={k}
                className="flex aspect-square items-center justify-center rounded-lg bg-base-100 dark:bg-base-800"
              >
                <Lock size={15} strokeWidth={2.2} className="text-base-400" />
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-[13px] font-medium text-base-700 dark:text-base-200">
            {t('story.morePhotos', { n: lockedCount })}
          </p>
        </a>
      )}
    </>
  )
}

export async function StoryShareView({ p, base }: { p: PublicStoryPreview; base: string }) {
  const t = await getTranslations('share')
  const webUrl = `${base}/story/${p.publicNo}`
  const appHref = appDeepLink(base, `/story/${p.publicNo}`, webUrl)

  return (
    <ShareViewFrame
      familyName={p.familyName}
      meta={p.totalPhotos > 0 ? t('story.metaWithCount', { n: p.totalPhotos }) : t('story.meta')}
      appHref={appHref}
      webUrl={webUrl}
    >
      <StoryPreviewBlock
        imageUrl={p.imageUrl}
        badgeTotal={p.totalPhotos}
        body={p.body}
        lockedCount={p.totalPhotos > 1 ? p.totalPhotos - 1 : 0}
        moreHref={webUrl}
      />
    </ShareViewFrame>
  )
}
