import type { CooccurringPerson } from '@/server/people/cooccurrence'
import { Users } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

/**
 * "이 사람은 딸기와 같은 사진 5장에 함께 나와요" — 합칠지 새 사람으로 둘지 판단할 때
 * 가장 강한 단서다. 한 사진에 얼굴이 둘 따로 잡혔으면 보통 다른 사람이기 때문.
 */
export async function PersonCooccurrenceNote({ people }: { people: CooccurringPerson[] }) {
  if (people.length === 0) return null
  const t = await getTranslations('misc')
  const first = people[0]
  if (!first) return null
  const name = first.name ?? t('people.unnamed')
  const rest = people.length - 1

  return (
    <div className="mb-3 flex items-start gap-2.5 rounded-2xl bg-point-50 px-4 py-3 text-point-600 dark:bg-point-500/10 dark:text-point-400">
      <Users size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {rest > 0
            ? t('people.alsoHereMore', { name, rest })
            : t('people.alsoHereTitle', { name })}{' '}
          <span className="font-normal opacity-80">
            {t('people.alsoHerePhotos', { count: first.photoCount })}
          </span>
        </p>
        <p className="mt-0.5 text-xs opacity-80">{t('people.alsoHereHint')}</p>
      </div>
    </div>
  )
}

/** 사진 타일 위에 겹치는 "함께: 딸기" 칩. 탭은 그대로 사진으로 가야 하므로 클릭을 받지 않는다. */
export async function PhotoCompanions({ people }: { people: CooccurringPerson[] }) {
  if (people.length === 0) return null
  const t = await getTranslations('misc')
  const names = people
    .slice(0, 2)
    .map((p) => p.name ?? t('people.unnamed'))
    .join(', ')
  const extra = people.length > 2 ? ` +${people.length - 2}` : ''
  return (
    <span className="pointer-events-none absolute inset-x-1 bottom-1 truncate rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
      {t('people.alsoInPhoto', { names: names + extra })}
    </span>
  )
}
