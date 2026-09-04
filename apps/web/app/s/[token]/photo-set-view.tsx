import { BulkDownloadButton } from '@/components/detail/bulk-download-button'
import type { DayStoryPreview } from '@/server/share/day-preview'
import type { PhotoSetPreview } from '@/server/share/photo-set'
import { Lock, Play } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { ShareHeader, ShareShell } from './share-frame'

// 여러 장(선택·날짜) 공유의 공개 뷰. 사진 그리드 + 다운로드(로그인한 가족만). 비로그인은
// 미리보기만 보고 "로그인하면 원본 저장" 안내. downloadIds 는 표시 상한과 무관한 전체 ready id.
// stories 는 날짜 공유일 때 그 날의 이야기(대표사진·제목·본문) — 그리드 위에 카드로.
export async function PhotoSetShareView({
  p,
  meta,
  canDownload,
  downloadIds,
  loginHref,
  stories = [],
}: {
  p: PhotoSetPreview
  meta: string
  canDownload: boolean
  downloadIds: string[]
  loginHref: string
  stories?: DayStoryPreview[]
}) {
  const t = await getTranslations('share')
  const more = p.total - p.items.length
  return (
    <ShareShell>
      <ShareHeader familyName={p.familyName} meta={meta} />

      {stories.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          {stories.map((s) => (
            <article
              key={s.id}
              className="overflow-hidden rounded-2xl border border-base-200/70 bg-base-0 shadow-card dark:border-base-800/70 dark:bg-base-900"
            >
              {s.coverUrl && (
                // biome-ignore lint/performance/noImgElement: 공개 랜딩의 signed URL — PictureImage(클라) 불필요
                <img src={s.coverUrl} alt="" className="aspect-[4/3] w-full object-cover" />
              )}
              <div className="px-4 py-3.5">
                {s.title && (
                  <h2 className="text-[16px] font-bold tracking-tight text-base-900 dark:text-base-50">
                    {s.title}
                  </h2>
                )}
                {s.body.trim() && (
                  <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-base-700 dark:text-base-200">
                    {s.body}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-1.5">
        {p.items.map((it, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: 순서 고정 프리뷰 그리드(안정 키 불필요)
            key={i}
            className="relative aspect-square overflow-hidden rounded-xl bg-base-100 dark:bg-base-800"
          >
            {it.displayUrl && (
              // biome-ignore lint/performance/noImgElement: 공개 랜딩의 signed URL — PictureImage(클라) 불필요
              <img src={it.displayUrl} alt="" className="h-full w-full object-cover" />
            )}
            {it.isVideo && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm">
                  <Play size={16} className="translate-x-0.5 fill-white text-white" />
                </span>
              </span>
            )}
          </div>
        ))}
      </div>
      {more > 0 && (
        <p className="mt-2 text-center text-[12px] text-base-400">
          {t('photoset.morePhotos', { n: more })}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2.5 pt-8">
        {canDownload ? (
          <BulkDownloadButton
            assetIds={downloadIds}
            label={t('photoset.savePhotos', { n: p.total })}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-point-500 text-[15px] font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
          />
        ) : (
          <>
            <a
              href={loginHref}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-point-500 text-[15px] font-semibold text-white active:scale-[0.99]"
            >
              <Lock size={16} strokeWidth={2.4} />
              {t('photoset.loginToSave')}
            </a>
            <p className="mt-1 text-center text-[12px] text-base-400">
              {t('photoset.familyOnlyDownload')}
            </p>
          </>
        )}
      </div>
    </ShareShell>
  )
}
