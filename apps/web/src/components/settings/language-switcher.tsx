'use client'
import type { Locale } from '@/i18n/request'
import { cn } from '@/lib/cn'
import { setLocale } from '@/server/i18n/set-locale'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

const OPTIONS: Locale[] = ['ko', 'en']

export function LanguageSwitcher() {
  const t = useTranslations('settings.language')
  const locale = useLocale()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex items-center gap-1 rounded-full border border-base-200 bg-base-100 p-1 dark:border-base-800 dark:bg-base-800">
      {OPTIONS.map((opt) => {
        const active = locale === opt
        return (
          <button
            key={opt}
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await setLocale(opt)
                router.refresh()
              })
            }
            aria-pressed={active}
            className={cn(
              'flex h-8 flex-1 items-center justify-center rounded-full px-3 text-xs font-medium transition disabled:opacity-60',
              active
                ? 'bg-base-0 text-base-900 shadow-sm dark:bg-base-900 dark:text-base-50'
                : 'text-base-500 hover:text-base-900 dark:hover:text-base-100',
            )}
          >
            {t(opt)}
          </button>
        )
      })}
    </div>
  )
}
