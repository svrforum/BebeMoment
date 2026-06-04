import type { PublicStoryPreview } from '@/server/share/public-story'
import { Lock } from 'lucide-react'
import { ShareViewFrame, appDeepLink } from './share-frame'

export function StoryShareView({ p, base }: { p: PublicStoryPreview; base: string }) {
  const webUrl = `${base}/story/${p.publicNo}`
  const appHref = appDeepLink(base, `/story/${p.publicNo}`, webUrl)
  const remaining = p.totalPhotos > 1 ? p.totalPhotos - 1 : 0
  const lockedTiles = ['a', 'b', 'c', 'd'].slice(0, Math.min(remaining, 4))

  return (
    <ShareViewFrame
      familyName={p.familyName}
      meta={`우리 가족 이야기${p.totalPhotos > 0 ? ` · 사진 ${p.totalPhotos}장` : ''}`}
      appHref={appHref}
      webUrl={webUrl}
    >
      {p.imageUrl && (
        <div className="relative mt-4">
          {/* biome-ignore lint/a11y/useAltText: 공개 대표사진(설명 없음) */}
          {/* biome-ignore lint/performance/noImgElement: 공개 랜딩의 단일 signed URL — PictureImage(클라) 불필요 */}
          <img src={p.imageUrl} alt="" className="w-full rounded-2xl object-cover shadow-card" />
          {p.totalPhotos > 1 && (
            <span className="absolute left-2.5 top-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm">
              1 / {p.totalPhotos}
            </span>
          )}
        </div>
      )}

      {p.body.trim() && (
        <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-base-800 dark:text-base-200">
          {p.body}
        </p>
      )}

      {remaining > 0 && (
        <a
          href={webUrl}
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
            사진 {remaining}장이 더 있어요 · 로그인하면 전체를 볼 수 있어요
          </p>
        </a>
      )}
    </ShareViewFrame>
  )
}
