'use client'
import {
  type AppRelease,
  fetchLatestAndroidRelease,
  installedAppVersion,
  isNewerVersion,
} from '@/lib/app-release'
import { Download, RefreshCw, Smartphone } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

type Check = 'idle' | 'checking' | 'uptodate' | 'failed'

/**
 * 설정의 '앱' 행. 앱 안에서는 현재 버전 + 업데이트 확인, 웹에서는 APK 다운로드를 보여준다.
 * 두 경우가 같은 릴리스 조회를 쓰므로 한 컴포넌트로 둔다.
 */
export function AppDownloadRow() {
  const t = useTranslations('settings.app')
  const [current, setCurrent] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [latest, setLatest] = useState<AppRelease | null>(null)
  const [check, setCheck] = useState<Check>('idle')

  // UA 는 클라이언트에서만 읽힌다 — 서버 렌더와 어긋나지 않게 마운트 후에 판정한다.
  useEffect(() => {
    setCurrent(installedAppVersion())
    setMounted(true)
  }, [])

  // 웹에서는 다운로드 링크가 바로 필요하므로 미리 받아둔다(캐시 사용).
  useEffect(() => {
    if (!mounted || current) return
    let cancelled = false
    fetchLatestAndroidRelease()
      .then((r) => {
        if (!cancelled) setLatest(r)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [mounted, current])

  const checkNow = async () => {
    setCheck('checking')
    try {
      // force — 방금 올라온 버전을 잡아야 하므로 세션 캐시를 믿지 않는다.
      const r = await fetchLatestAndroidRelease({ force: true })
      if (!r) {
        setCheck('failed')
        return
      }
      setLatest(r)
      setCheck(current && isNewerVersion(r.version, current) ? 'idle' : 'uptodate')
    } catch {
      setCheck('failed')
    }
  }

  if (!mounted) return null

  const updatable = current && latest && isNewerVersion(latest.version, current)

  return (
    <div className="rounded-2xl border border-base-200/70 bg-base-0 px-4 py-3.5 dark:border-base-800/70 dark:bg-base-900">
      <div className="flex items-center gap-3">
        <Smartphone size={18} strokeWidth={2.1} className="shrink-0 text-base-400" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-base-900 dark:text-base-50">{t('title')}</p>
          <p className="mt-0.5 text-[13px] text-base-500">
            {current ? t('installed', { version: current }) : t('webHint')}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {current ? (
          <>
            <button
              type="button"
              onClick={checkNow}
              disabled={check === 'checking'}
              className="inline-flex items-center gap-1.5 rounded-full border border-base-200 px-3.5 py-2 text-[13px] font-medium transition active:scale-95 disabled:opacity-60 dark:border-base-700"
            >
              <RefreshCw size={14} strokeWidth={2.2} />
              {check === 'checking' ? t('checking') : t('checkUpdate')}
            </button>
            {check === 'uptodate' && (
              <span className="text-[13px] text-base-500">{t('upToDate')}</span>
            )}
            {check === 'failed' && (
              <span className="text-[13px] text-danger">{t('checkFailed')}</span>
            )}
          </>
        ) : null}

        {(updatable || (!current && latest)) && (
          <a
            href={latest?.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-point-500 px-3.5 py-2 text-[13px] font-semibold text-white transition active:scale-95"
          >
            <Download size={14} strokeWidth={2.4} />
            {current
              ? t('updateTo', { version: latest?.version ?? '' })
              : t('download', { version: latest?.version ?? '' })}
          </a>
        )}
      </div>
    </div>
  )
}
