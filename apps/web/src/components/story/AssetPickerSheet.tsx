'use client'
import { Button } from '@/components/ui/button'
import { PictureImage } from '@/components/ui/picture-image'
import { Sheet } from '@/components/ui/sheet'
import { pickBlurhash, pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import type { AssetUrls } from '@bebe/media-client'
import { useTranslations } from 'next-intl'
import { type ReactNode, useEffect, useState } from 'react'

export type PickerAsset = { id: string; urls: AssetUrls | null }

export function AssetPickerSheet({
  available,
  initialSelected = [],
  onChange,
  triggerLabel,
  triggerClassName,
  triggerIcon,
  max = 10,
}: {
  available: PickerAsset[]
  initialSelected?: string[]
  onChange: (ids: string[]) => void
  triggerLabel: string
  triggerClassName?: string
  triggerIcon?: ReactNode
  max?: number
}) {
  const t = useTranslations('story')
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected))
  // re-seed when parent updates the selection (e.g. removed photos via another path)
  useEffect(() => {
    if (!open) setSelected(new Set(initialSelected))
  }, [initialSelected, open])

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else if (next.size < max) next.add(id)
    setSelected(next)
  }

  function confirm() {
    onChange(Array.from(selected))
    setOpen(false)
  }

  return (
    <>
      {triggerClassName ? (
        <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
          {triggerIcon}
          <span>{triggerLabel}</span>
        </button>
      ) : (
        <Button type="button" variant="secondary" className="w-full" onClick={() => setOpen(true)}>
          {triggerLabel}
        </Button>
      )}
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={t('picker.title', { n: selected.size, max })}
      >
        <div className="grid grid-cols-3 gap-1">
          {available.map((a) => {
            const isSel = selected.has(a.id)
            const trio = pickThumbTrio(a.urls)
            const fallbackUrl = pickThumbUrl(a.urls)
            const hasImage = trio !== null || fallbackUrl !== null
            return (
              <button
                type="button"
                key={a.id}
                onClick={() => toggle(a.id)}
                className={`relative aspect-square overflow-hidden rounded-lg border border-base-200 dark:border-base-800 ${isSel ? 'ring-2 ring-point-500' : ''}`}
              >
                {hasImage ? (
                  <PictureImage
                    assetId={a.id}
                    trio={trio}
                    fallbackUrl={fallbackUrl}
                    alt=""
                    dominantColor={a.urls?.dominantColor ?? null}
                    blurhash={pickBlurhash(a.urls)}
                    className="h-full w-full"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-base-500">
                    {t('picker.processing')}
                  </div>
                )}
                {isSel && (
                  <div className="absolute right-1 top-1 rounded-full bg-point-500 px-1.5 text-xs text-white">
                    ✓
                  </div>
                )}
              </button>
            )
          })}
        </div>
        <div className="sticky bottom-0 mt-4 border-t border-base-200 bg-base-0 pt-4 dark:border-base-800 dark:bg-base-900">
          <Button onClick={confirm} className="w-full">
            {t('picker.confirm')}
          </Button>
        </div>
      </Sheet>
    </>
  )
}
