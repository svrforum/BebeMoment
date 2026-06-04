'use client'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

/**
 * 네이티브 앱에서만 보이는 "서버 변경" 링크. 앱의 로컬 온보딩(https://localhost)으로
 * `?reset=1` 을 달아 보내면 저장된 서버주소를 지우고 입력 폼이 뜬다(www/onboarding.js).
 * 웹/브라우저에선 의미 없으므로 UA 표식(bebeApp)일 때만 렌더.
 */
export function ServerChangeLink() {
  const t = useTranslations('auth')
  const [isApp, setIsApp] = useState(false)
  useEffect(() => {
    setIsApp(navigator.userAgent.includes('bebeApp'))
  }, [])
  if (!isApp) return null
  return (
    <a
      href="https://localhost/?reset=1"
      className="mt-6 block text-center text-[13px] text-base-400 underline-offset-2 hover:text-base-600 hover:underline dark:text-base-500"
    >
      {t('login.changeServer')}
    </a>
  )
}
