'use client'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('common')
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center px-6 py-10 text-center">
      <p className="text-sm font-medium text-base-500">500</p>
      <h1 className="mt-3 text-[32px] font-bold tracking-tight">{t('errorTitle')}</h1>
      <p className="mt-2 text-base text-base-500">{t('errorBody')}</p>
      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-12 items-center justify-center rounded-2xl bg-point-500 px-6 font-semibold text-white shadow-[0_6px_20px_-6px] shadow-point-500/45 transition hover:bg-point-600"
        >
          {t('tryAgain')}
        </button>
        <Link
          href="/"
          className="inline-flex h-12 items-center justify-center rounded-2xl bg-base-100 px-6 font-semibold text-base-900 transition hover:bg-base-200 dark:bg-base-800 dark:text-base-100 dark:hover:bg-base-700"
        >
          {t('home')}
        </Link>
      </div>
    </main>
  )
}
