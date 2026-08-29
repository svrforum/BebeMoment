'use client'
import { Smartphone } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

/**
 * 안드로이드 브라우저에서 초대 링크를 열면 "앱에서 이어하기" 를 띄운다. 누르면 bebe://invite
 * 딥링크로 앱을 열어 (1) 서버주소 자동설정 + (2) 초대 화면으로 이동. 앱이 없으면 intent 의
 * browser_fallback_url 로 릴리스(설치) 페이지로. 이미 앱 안(WebView, UA=bebeApp)이거나
 * 안드로이드가 아니면 숨긴다(웹 가입 흐름 그대로).
 */
export function InviteAppButton({ token }: { token: string }) {
  const t = useTranslations('invite')
  const [href, setHref] = useState<string | null>(null)

  useEffect(() => {
    const ua = navigator.userAgent || ''
    if (!/Android/i.test(ua) || /bebeApp/.test(ua)) return
    const server = window.location.origin
    // 앱이 없으면 우리 서버가 최신 APK 로 바로 보낸다. GitHub 의 /releases/latest 는 태그 종류를
    // 안 가려 훨씬 잦은 서버 릴리스를 가리키기 일쑤였다 — APK 가 없는 페이지로 보내는 셈이었다.
    const install = `${server}/download`
    const intent =
      `intent://invite?server=${encodeURIComponent(server)}&token=${encodeURIComponent(token)}` +
      '#Intent;scheme=bebe;package=im.bebe.app;' +
      `S.browser_fallback_url=${encodeURIComponent(install)};end`
    setHref(intent)
  }, [token])

  if (!href) return null

  return (
    <div className="mb-5 space-y-2">
      <a
        href={href}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-point-500 px-5 text-[16px] font-semibold text-white transition active:scale-[0.98] hover:bg-point-600"
      >
        <Smartphone size={18} strokeWidth={2.2} />
        {t('app.continue')}
      </a>
      <p className="text-center text-[12px] text-base-400">{t('app.installHint')}</p>
    </div>
  )
}
