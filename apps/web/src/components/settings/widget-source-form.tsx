'use client'
import {
  removeWidgetPhoto,
  saveWidgetConfig,
  saveWidgetPhotoOrder,
} from '@/(app)/settings/widget/actions'
import { PictureImage } from '@/components/ui/picture-image'
import { ReorderRow } from '@/components/upload/reorder-row'
import { cn } from '@/lib/cn'
import { useToast } from '@/lib/toast'
import { Check, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

type WidgetPhoto = { id: string; thumb: string }

const OPTIONS = [
  { value: 'recent', labelKey: 'recentLabel', descKey: 'recentDesc' },
  { value: 'bookmark_random', labelKey: 'bookmarkRandomLabel', descKey: 'bookmarkRandomDesc' },
  { value: 'collection', labelKey: 'collectionLabel', descKey: 'collectionDesc' },
] as const

export function WidgetSourceForm({
  initialSource,
  photos,
}: {
  initialSource: string
  photos: WidgetPhoto[]
}) {
  const [source, setSource] = useState(initialSource)
  const [items, setItems] = useState(photos)
  const [pending, startTransition] = useTransition()
  const toast = useToast()
  const t = useTranslations('settings.widgetSource')

  const notify = (ok: boolean) =>
    toast(
      ok
        ? { title: t('savedSuccess'), variant: 'success' }
        : { title: t('saveFailed'), variant: 'danger' },
    )

  const pickSource = (v: string) => {
    setSource(v)
    startTransition(async () => {
      notify((await saveWidgetConfig({ source: v })).ok)
    })
  }

  const reorder = (ids: string[]) => {
    const byId = new Map(items.map((p) => [p.id, p]))
    setItems(ids.map((id) => byId.get(id)).filter((p): p is WidgetPhoto => Boolean(p)))
    startTransition(async () => {
      await saveWidgetPhotoOrder(ids)
    })
  }

  const remove = (id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id))
    startTransition(async () => {
      notify((await removeWidgetPhoto(id)).ok)
    })
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {OPTIONS.map((o) => {
          const active = source === o.value
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => pickSource(o.value)}
              disabled={pending}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left transition active:scale-[0.99] disabled:opacity-60',
                active
                  ? 'border-point-500 bg-point-50 dark:bg-point-500/10'
                  : 'border-base-200/70 bg-base-0 dark:border-base-800/70 dark:bg-base-900',
              )}
            >
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-base-900 dark:text-base-50">
                  {t(`options.${o.labelKey}`)}
                </p>
                <p className="mt-0.5 text-[13px] text-base-500">{t(`options.${o.descKey}`)}</p>
              </div>
              <span
                className={cn(
                  'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2',
                  active ? 'border-point-500 bg-point-500' : 'border-base-300 dark:border-base-700',
                )}
              >
                {active && <Check size={12} strokeWidth={3.5} className="text-white" />}
              </span>
            </button>
          )
        })}
      </div>

      {source === 'collection' && (
        <div className="space-y-2">
          <p className="px-1 text-[13px] font-semibold text-base-500">{t('collectionTitle')}</p>
          {items.length === 0 ? (
            <p className="rounded-2xl border border-base-200/70 bg-base-0 px-4 py-6 text-center text-[13px] text-base-400 dark:border-base-800/70 dark:bg-base-900">
              {t('collectionEmpty')}
            </p>
          ) : (
            <>
              <ReorderRow
                keys={items.map((p) => p.id)}
                onReorder={reorder}
                coverLabel={t('coverBadge')}
                renderItem={(id) => {
                  const p = items.find((x) => x.id === id)
                  if (!p) return null
                  return (
                    <div className="relative h-24 w-24 overflow-hidden rounded-xl">
                      <PictureImage
                        trio={null}
                        fallbackUrl={p.thumb}
                        alt=""
                        aspectRatio={1}
                        dominantColor={null}
                        blurhash={null}
                        className="h-full w-full"
                        loading="lazy"
                      />
                      <button
                        type="button"
                        aria-label={t('removePhoto')}
                        onClick={() => remove(p.id)}
                        className="absolute top-1 right-1 rounded-full bg-black/55 p-1 text-white"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )
                }}
              />
              <p className="px-1 text-[11px] text-base-400">{t('collectionHint')}</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
