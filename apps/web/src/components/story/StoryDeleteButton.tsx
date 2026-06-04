'use client'
import { PictureImage } from '@/components/ui/picture-image'
import { Sheet } from '@/components/ui/sheet'
import { pickBlurhash, pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import type { AssetUrls } from '@bebe/media-client'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

type Photo = { id: string; urls: AssetUrls | null }

type Props = {
  /** entry id 에 바인딩된 server action. deletePhotos 를 인자로 받는다. */
  onDelete: (deletePhotos: boolean) => Promise<void>
  /** 스토리에 포함된 사진들 — 삭제 다이얼로그에서 보여주고 "함께 삭제" 여부를 고른다. */
  photos: Photo[]
}

const THUMB_LIMIT = 9

export function StoryDeleteButton({ onDelete, photos }: Props) {
  const t = useTranslations('story')
  const [open, setOpen] = useState(false)
  const [deletePhotos, setDeletePhotos] = useState(false)
  const [pending, startTransition] = useTransition()
  const shown = photos.slice(0, THUMB_LIMIT)
  const overflow = photos.length - shown.length

  const handleConfirm = () => {
    startTransition(async () => {
      await onDelete(deletePhotos)
      setOpen(false)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDeletePhotos(false)
          setOpen(true)
        }}
        aria-label={t('delete.trigger')}
        className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium text-red-500 transition-colors hover:bg-red-50 active:scale-95 dark:hover:bg-red-500/10"
      >
        <Trash2 size={13} strokeWidth={2.2} />
        <span>{t('delete.trigger')}</span>
      </button>

      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (pending) return
          setOpen(next)
        }}
      >
        <div className="flex flex-col gap-4 px-1 py-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-500/15">
            <AlertTriangle size={22} strokeWidth={2.2} />
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-base-900 dark:text-base-50">
              {t('delete.confirmTitle')}
            </p>
            <p className="mt-1 text-sm text-base-500">{t('delete.confirmDesc')}</p>
          </div>

          {photos.length > 0 && (
            <>
              <div className="grid grid-cols-5 gap-1.5">
                {shown.map((p) => {
                  const trio = pickThumbTrio(p.urls)
                  const fallbackUrl = pickThumbUrl(p.urls)
                  return (
                    <div
                      key={p.id}
                      className="relative aspect-square overflow-hidden rounded-lg bg-base-100 dark:bg-base-800"
                    >
                      {(trio || fallbackUrl) && (
                        <PictureImage
                          trio={trio}
                          fallbackUrl={fallbackUrl}
                          alt=""
                          aspectRatio={1}
                          dominantColor={p.urls?.dominantColor ?? null}
                          blurhash={pickBlurhash(p.urls)}
                          className="h-full w-full"
                          loading="lazy"
                        />
                      )}
                    </div>
                  )
                })}
                {overflow > 0 && (
                  <div className="flex aspect-square items-center justify-center rounded-lg bg-base-100 text-[12px] font-semibold text-base-500 dark:bg-base-800">
                    +{overflow}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setDeletePhotos((v) => !v)}
                aria-pressed={deletePhotos}
                className="flex items-center justify-between gap-3 rounded-2xl border border-base-200 px-4 py-3 text-left dark:border-base-700"
              >
                <span>
                  <span className="block text-sm font-medium text-base-900 dark:text-base-50">
                    {t('delete.alsoPhotos', { n: photos.length })}
                  </span>
                  <span className="block text-[12px] text-base-400">
                    {deletePhotos ? t('delete.photosToTrash') : t('delete.photosKept')}
                  </span>
                </span>
                <span
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    deletePhotos ? 'bg-red-500' : 'bg-base-300 dark:bg-base-600'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      deletePhotos ? 'translate-x-[22px]' : 'translate-x-0.5'
                    }`}
                  />
                </span>
              </button>
            </>
          )}

          <div className="mt-1 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={pending}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-red-500 text-base font-semibold text-white shadow-sm transition-transform ease-ios active:scale-[0.98] hover:bg-red-600 disabled:opacity-60"
            >
              {pending
                ? t('delete.deleting')
                : deletePhotos && photos.length > 0
                  ? t('delete.deleteStoryAndPhotos', { n: photos.length })
                  : t('delete.deleteStoryOnly')}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-base-100 text-base font-medium text-base-900 transition-colors hover:bg-base-200 disabled:opacity-60 dark:bg-base-800 dark:text-base-50 dark:hover:bg-base-700"
            >
              {t('delete.cancel')}
            </button>
          </div>
        </div>
      </Sheet>
    </>
  )
}
