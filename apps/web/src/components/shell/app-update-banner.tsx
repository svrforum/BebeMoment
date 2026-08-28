'use client'
import {
  type AppRelease,
  fetchLatestAndroidRelease,
  installedAppVersion,
  isNewerVersion,
} from '@/lib/app-release'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

// 앱 APK 는 GitHub 릴리즈(android-v* 태그)로만 배포된다. 앱은 UA 에 bebeApp/<ver> 를
// 싣고(MainActivity.markUserAgent), 이 배너가 최신 android 릴리즈와 비교해 구버전이면
// 업데이트를 안내한다. 웹(앱 아님)에선 current=null 이라 아무것도 안 뜬다.
// 릴리즈 조회·버전 비교는 lib/app-release 와 공유한다(설정의 '업데이트 확인' 과 같은 소스).

export function AppUpdateBanner() {
  const t = useTranslations('shell')
  const [latest, setLatest] = useState<AppRelease | null>(null)

  useEffect(() => {
    const current = installedAppVersion()
    if (!current) return
    let cancelled = false

    const run = async () => {
      try {
        const data = await fetchLatestAndroidRelease()
        if (cancelled || !data) return
        if (
          isNewerVersion(data.version, current) &&
          localStorage.getItem('bebe.appUpdateDismissed') !== data.version
        ) {
          setLatest(data)
        }
      } catch {
        // 네트워크·레이트리밋 등은 조용히 무시 — 업데이트 안내는 베스트에포트.
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  if (!latest) return null

  const dismiss = () => {
    localStorage.setItem('bebe.appUpdateDismissed', latest.version)
    setLatest(null)
  }

  return (
    <div className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-40 mx-auto flex max-w-sm items-center gap-3 rounded-2xl bg-base-900 px-4 py-3 text-sm shadow-lg dark:bg-base-100">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-base-50 dark:text-base-900">{t('update.title')}</p>
        <p className="truncate text-[13px] text-base-400 dark:text-base-500">
          {t('update.body', { version: latest.version })}
        </p>
      </div>
      <a
        href={latest.url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded-full bg-point-500 px-3.5 py-1.5 font-semibold text-white active:scale-95"
      >
        {t('update.action')}
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('update.dismiss')}
        className="shrink-0 text-base-400 active:opacity-70 dark:text-base-500"
      >
        ✕
      </button>
    </div>
  )
}
