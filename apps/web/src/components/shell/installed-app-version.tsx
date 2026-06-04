'use client'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

/**
 * 설치된 네이티브 앱 버전(UA 의 bebeApp/<ver>) 을 표시. 웹 브라우저(앱 아님)에선 마커가
 * 없어 아무것도 안 보인다. 업데이트 배너가 계속 뜰 때 "내가 실제로 몇 버전인지" 확인용.
 */
export function InstalledAppVersion() {
  const t = useTranslations('shell')
  const [ver, setVer] = useState<string | null>(null)
  useEffect(() => {
    const m = navigator.userAgent.match(/bebeApp\/(\d+\.\d+\.\d+)/)
    if (m?.[1]) setVer(m[1])
  }, [])
  if (!ver) return null
  return <span>{t('installedAppVersion', { version: ver })}</span>
}
