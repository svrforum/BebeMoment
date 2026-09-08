import { PictureImage } from '@/components/ui/picture-image'
import { pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import type { CooccurringPerson } from '@/server/people/cooccurrence'
import { UserRound } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'

function faceCrop(bbox: { x: number; y: number; w: number; h: number }): string {
  return `${Math.round((bbox.x + bbox.w / 2) * 100)}% ${Math.round((bbox.y + bbox.h / 2) * 100)}%`
}

/** 인물 목록의 동그란 얼굴과 같은 모양 — 여기서도 사람은 이름표가 아니라 얼굴로 알아본다. */
function Face({ person, size }: { person: CooccurringPerson; size: string }) {
  const cover = person.cover
  const trio = cover ? pickThumbTrio(cover.urls) : null
  const fallbackUrl = cover ? pickThumbUrl(cover.urls) : null
  return (
    <span
      className={`${size} inline-block shrink-0 overflow-hidden rounded-full bg-base-100 dark:bg-base-800`}
    >
      {trio || fallbackUrl ? (
        <PictureImage
          trio={trio}
          fallbackUrl={fallbackUrl}
          alt=""
          className="h-full w-full"
          objectPosition={cover ? faceCrop(cover.bbox) : '50% 50%'}
          loading="lazy"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-base-400">
          <UserRound size={14} strokeWidth={1.8} />
        </span>
      )}
    </span>
  )
}

/**
 * "이 사진들에 함께 있는 사람" — 합칠지 새 사람으로 둘지 판단하는 단서다. 한 사진에 얼굴이
 * 둘 따로 잡혔으면 보통 다른 사람이기 때문. 문구를 크게 띄우는 대신 얼굴을 보여 준다.
 */
export async function PersonCooccurrenceNote({ people }: { people: CooccurringPerson[] }) {
  if (people.length === 0) return null
  const t = await getTranslations('misc')
  return (
    <section className="mb-4">
      <p className="mb-2 px-0.5 text-xs text-base-500">{t('people.alsoHereHint')}</p>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {people.map((p) => (
          <Link
            key={p.id}
            href={`/people/${p.id}`}
            className="flex shrink-0 items-center gap-2 rounded-full bg-base-100 py-1 pr-3.5 pl-1 transition-colors active:bg-base-200 dark:bg-base-800 dark:active:bg-base-700"
          >
            <Face person={p} size="h-8 w-8" />
            <span className="min-w-0">
              <span className="block max-w-32 truncate text-sm font-medium text-base-800 dark:text-base-100">
                {p.name ?? t('people.unnamed')}
              </span>
              <span className="block text-[11px] tabular-nums text-base-500">
                {t('people.alsoHerePhotos', { count: p.photoCount })}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

/**
 * 사진 타일 위의 작은 얼굴들 — 그 사진에 같이 있는 사람. 글자 칩은 타일을 가리고 읽히지도
 * 않아서 얼굴만 겹쳐 둔다. 탭은 그대로 사진으로 가야 하니 클릭을 받지 않는다.
 */
export function PhotoCompanions({ people }: { people: CooccurringPerson[] }) {
  if (people.length === 0) return null
  const shown = people.slice(0, 3)
  return (
    <span className="pointer-events-none absolute right-1 bottom-1 flex -space-x-1.5">
      {shown.map((p) => (
        <span key={p.id} className="rounded-full ring-2 ring-white/90 dark:ring-black/60">
          <Face person={p} size="h-5 w-5" />
        </span>
      ))}
      {people.length > shown.length && (
        <span className="flex h-5 items-center rounded-full bg-black/55 px-1.5 text-[10px] font-semibold text-white ring-2 ring-white/90 dark:ring-black/60">
          +{people.length - shown.length}
        </span>
      )}
    </span>
  )
}
