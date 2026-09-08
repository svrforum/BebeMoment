'use client'
import { PictureImage } from '@/components/ui/picture-image'
import { pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import type { PersonSummary } from '@/server/people/list'
import { Check, UserRound } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

export function PersonCard({
  person,
  selectable = false,
  selected = false,
  onToggle,
}: {
  person: PersonSummary
  /** 선택 모드에서는 사진으로 들어가지 않고 고르기만 한다. */
  selectable?: boolean
  selected?: boolean
  onToggle?: (id: string) => void
}) {
  const t = useTranslations('misc')
  const { cover } = person
  const trio = cover ? pickThumbTrio(cover.urls) : null
  const fallbackUrl = cover ? pickThumbUrl(cover.urls) : null
  // 대표 얼굴 bbox 중심으로 크롭(object-position) — 둥근 원 안에 얼굴이 가운데 오게.
  const objectPosition = cover
    ? `${Math.round((cover.bbox.x + cover.bbox.w / 2) * 100)}% ${Math.round(
        (cover.bbox.y + cover.bbox.h / 2) * 100,
      )}%`
    : '50% 50%'
  const label = person.name ?? t('people.unnamed')

  const body = (
    <>
      <div
        className={`relative aspect-square overflow-hidden rounded-full bg-base-100 dark:bg-base-900 ${
          selected ? 'ring-2 ring-point-500 ring-offset-2 dark:ring-offset-base-950' : ''
        }`}
      >
        {trio || fallbackUrl ? (
          <PictureImage
            trio={trio}
            fallbackUrl={fallbackUrl}
            alt={label}
            className="h-full w-full"
            objectPosition={objectPosition}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-base-400">
            <UserRound size={32} strokeWidth={1.6} />
          </div>
        )}
        {selectable && (
          <span
            className={`absolute right-1 bottom-1 flex h-6 w-6 items-center justify-center rounded-full border-2 ${
              selected
                ? 'border-point-500 bg-point-500 text-white'
                : 'border-white/80 bg-black/25 text-transparent'
            }`}
          >
            <Check size={14} strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="mt-2 text-center">
        <div
          className={
            person.name
              ? 'truncate text-sm font-semibold text-base-900 dark:text-base-50'
              : 'truncate text-sm font-medium text-base-400'
          }
        >
          {label}
        </div>
        <div className="text-xs tabular-nums text-base-500">
          {t('people.cardPhotoCount', { count: person.photoCount })}
        </div>
      </div>
    </>
  )

  if (selectable) {
    return (
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onToggle?.(person.id)}
        className="block w-full text-left"
      >
        {body}
      </button>
    )
  }
  return (
    <Link href={`/people/${person.id}`} className="block">
      {body}
    </Link>
  )
}
