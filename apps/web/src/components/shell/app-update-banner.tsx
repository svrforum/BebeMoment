'use client'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

// 앱 APK 는 GitHub 릴리즈(android-v* 태그)로만 배포된다. 앱은 UA 에 bebeApp/<ver> 를
// 싣고(MainActivity.markUserAgent), 이 배너가 GitHub 최신 android 릴리즈와 비교해
// 구버전이면 업데이트를 안내한다. 웹(앱 아님)에선 current=null 이라 아무것도 안 뜬다.
const REPO = 'svrforum/bebe-moment'

function appVersionFromUA(): string | null {
  if (typeof navigator === 'undefined') return null
  const m = navigator.userAgent.match(/bebeApp\/(\d+\.\d+\.\d+)/)
  return m ? (m[1] ?? null) : null
}

function isNewer(latest: string, current: string): boolean {
  const a = latest.split('.').map(Number)
  const b = current.split('.').map(Number)
  for (let i = 0; i < 3; i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return false
}

type Latest = { version: string; url: string }

export function AppUpdateBanner() {
  const t = useTranslations('shell')
  const [latest, setLatest] = useState<Latest | null>(null)

  useEffect(() => {
    const current = appVersionFromUA()
    if (!current) return
    let cancelled = false

    const run = async () => {
      try {
        const cached = sessionStorage.getItem('bebe.appLatest')
        let data: Latest | null = cached ? (JSON.parse(cached) as Latest) : null
        if (!data) {
          // per_page=100(API 최대) — web(v*) 릴리즈가 잦아 30개만 보면 그 사이에 묻힌
          // 최신 android-v* 를 놓쳐 업데이트 안내가 조용히 끊긴다.
          const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`, {
            headers: { Accept: 'application/vnd.github+json' },
          })
          if (!res.ok) return
          const releases = (await res.json()) as Array<{
            tag_name: string
            html_url: string
            prerelease: boolean
            draft: boolean
            assets?: Array<{ name: string; browser_download_url: string }>
          }>
          const android = releases.find(
            (r) => !r.draft && !r.prerelease && r.tag_name.startsWith('android-v'),
          )
          if (!android) return
          // .apk 자산으로 바로 보낸다 — 릴리즈 HTML 페이지를 열면 사용자가 'Source code
          // (zip)' 를 오선택하거나 브라우저가 .apk 를 받다 끊겨 "패키지가 잘못됨" 으로 설치가
          // 깨지는 함정이 있다. apk 자산이 있으면 직링크, 없으면 페이지로 폴백.
          const apk = android.assets?.find((a) => a.name.toLowerCase().endsWith('.apk'))
          data = {
            version: android.tag_name.replace('android-v', ''),
            url: apk?.browser_download_url ?? android.html_url,
          }
          sessionStorage.setItem('bebe.appLatest', JSON.stringify(data))
        }
        if (cancelled || !data) return
        if (
          isNewer(data.version, current) &&
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
