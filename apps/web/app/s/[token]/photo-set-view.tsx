import { BulkDownloadButton } from '@/components/detail/bulk-download-button'
import type { PhotoSetItem, PhotoSetPreview } from '@/server/share/photo-set'
import { Lock, Play } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { ShareHeader, ShareShell } from './share-frame'

/** 공개 화면의 사진 격자. `lazyFrom` 번째부터는 스크롤해 올 때 받는다 — 한 링크에 100장까지 실린다. */
export function PhotoTiles({ items, lazyFrom = 9 }: { items: PhotoSetItem[]; lazyFrom?: number }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {items.map((it, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: 순서 고정 프리뷰 그리드(안정 키 불필요)
          key={i}
          className="relative aspect-square overflow-hidden rounded-xl bg-base-100 dark:bg-base-800"
        >
          {it.displayUrl && (
            // biome-ignore lint/performance/noImgElement: 공개 랜딩의 signed URL — PictureImage(클라) 불필요
            <img
              src={it.displayUrl}
              alt=""
              loading={i < lazyFrom ? 'eager' : 'lazy'}
              decoding="async"
              className="h-full w-full object-cover"
            />
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
  )
}

/** 화면 아래의 저장 — 로그인한 가족은 바로 저장, 아니면 로그인 안내(원본 저장은 가족만). */
export async function SaveFooter({
  total,
  canDownload,
  downloadIds,
  loginHref,
}: {
  total: number
  canDownload: boolean
  downloadIds: string[]
  loginHref: string
}) {
  const t = await getTranslations('share')
  return (
    <div className="mt-auto flex flex-col gap-2.5 pt-8">
      {canDownload ? (
        <BulkDownloadButton
          assetIds={downloadIds}
          label={t('photoset.savePhotos', { n: total })}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-point-600 text-[15px] font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
        />
      ) : (
        <>
          <a
            href={loginHref}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-point-600 text-[15px] font-semibold text-white active:scale-[0.99]"
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
  )
}

// 여러 장(선택·날짜) 공유의 공개 뷰. 사진 그리드 + 다운로드(로그인한 가족만). 비로그인은
// 미리보기만 보고 "로그인하면 원본 저장" 안내. downloadIds 는 표시 상한과 무관한 전체 ready id.
export async function PhotoSetShareView({
  p,
  meta,
  canDownload,
  downloadIds,
  loginHref,
}: {
  p: PhotoSetPreview
  meta: string
  canDownload: boolean
  downloadIds: string[]
  loginHref: string
}) {
  const t = await getTranslations('share')
  const more = p.total - p.items.length
  return (
    <ShareShell>
      <ShareHeader familyName={p.familyName} meta={meta} />

      <div className="mt-4">
        <PhotoTiles items={p.items} />
      </div>
      {more > 0 && (
        <p className="mt-2 text-center text-[12px] text-base-400">
          {t('photoset.morePhotos', { n: more })}
        </p>
      )}

      <SaveFooter
        total={p.total}
        canDownload={canDownload}
        downloadIds={downloadIds}
        loginHref={loginHref}
      />
    </ShareShell>
  )
}
