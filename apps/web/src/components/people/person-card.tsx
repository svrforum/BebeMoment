'use client'
import { PictureImage } from '@/components/ui/picture-image'
import { pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import type { PersonSummary } from '@/server/people/list'
import { UserRound } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

export function PersonCard({ person }: { person: PersonSummary }) {
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

  return (
    <Link href={`/people/${person.id}`} className="block">
      <div className="relative aspect-square overflow-hidden rounded-full bg-base-100 dark:bg-base-900">
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
          {t('people.cardPhotoCount', { count: person.faceCount })}
        </div>
      </div>
    </Link>
  )
}
