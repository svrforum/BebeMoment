import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import type { ReactNode } from 'react'

export type TimelineSortMode = 'taken' | 'uploaded'

type Props = {
  /** Currently active mode (server-resolved from `?sort=`). */
  value: TimelineSortMode
  /** Other URL params to preserve when switching. `sort` 키는
   *  이쪽에서 덮어쓰므로 호출자가 넣어도 무시된다. */
  preserveParams?: Record<string, string | string[] | undefined>
  /** 같은 줄 오른쪽에 붙는 슬롯(추억·사람 아이콘 진입점 등). */
  right?: ReactNode
}

/**
 * iOS-style segmented control: 촬영일순 / 업로드순. URL-driven (`?sort=`)
 * 이라 새로고침·공유 시에도 살아남는다. 클라 상태 없이 `<Link>` 두 개로
 * 구현 — 폼/JS 없이도 동작.
 *
 * pill-shaped track, active 알약은 화이트(다크모드는 base-900)
 * + soft shadow, inactive 는 muted. 그라데이션·강한 primary 컬러 금지.
 */
export async function TimelineSortToggle({ value, preserveParams = {}, right }: Props) {
  const t = await getTranslations('timeline')
  const buildHref = (mode: TimelineSortMode): string => {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(preserveParams)) {
      if (k === 'sort') continue
      if (v === undefined) continue
      if (Array.isArray(v)) {
        for (const x of v) params.append(k, x)
      } else {
        params.set(k, v)
      }
    }
    // 'taken' 은 기본값이라 굳이 ?sort=taken 으로 더럽히지 않는다.
    if (mode !== 'taken') params.set('sort', mode)
    const qs = params.toString()
    return qs ? `/timeline?${qs}` : '/timeline'
  }

  const options: { mode: TimelineSortMode; label: string }[] = [
    { mode: 'taken', label: t('sort.taken') },
    { mode: 'uploaded', label: t('sort.uploaded') },
  ]

  return (
    <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-5 pt-2 lg:max-w-5xl xl:max-w-6xl">
      <div
        role="tablist"
        aria-label={t('sort.ariaLabel')}
        className="inline-flex rounded-full bg-base-100 p-1 text-[13px] dark:bg-base-800"
      >
        {options.map((opt) => {
          const active = opt.mode === value
          return (
            <Link
              key={opt.mode}
              role="tab"
              aria-selected={active}
              href={buildHref(opt.mode)}
              scroll={false}
              prefetch={false}
              className={
                active
                  ? 'inline-flex h-8 items-center rounded-full bg-base-0 px-3.5 font-semibold text-base-900 shadow-card transition dark:bg-base-900 dark:text-base-50'
                  : 'inline-flex h-8 items-center rounded-full px-3.5 font-medium text-base-500 transition hover:text-base-700 dark:text-base-400 dark:hover:text-base-200'
              }
            >
              {opt.label}
            </Link>
          )
        })}
      </div>
      {right ? <div className="flex flex-shrink-0 items-center gap-1.5">{right}</div> : null}
    </div>
  )
}
