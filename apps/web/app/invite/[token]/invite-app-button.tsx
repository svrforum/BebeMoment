'use client'
import { Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'

// 앱 미설치 시 보낼 설치 안내(릴리스 페이지). intent 의 browser_fallback_url 로.
const INSTALL_URL = 'https://github.com/svrforum/bebe-moment/releases/latest'

/**
 * 안드로이드 브라우저에서 초대 링크를 열면 "앱에서 이어하기" 를 띄운다. 누르면 bebe://invite
 * 딥링크로 앱을 열어 (1) 서버주소 자동설정 + (2) 초대 화면으로 이동. 앱이 없으면 intent 의
 * browser_fallback_url 로 릴리스(설치) 페이지로. 이미 앱 안(WebView, UA=bebeApp)이거나
 * 안드로이드가 아니면 숨긴다(웹 가입 흐름 그대로).
 */
export function InviteAppButton({ token }: { token: string }) {
  const [href, setHref] = useState<string | null>(null)

  useEffect(() => {
    const ua = navigator.userAgent || ''
    if (!/Android/i.test(ua) || /bebeApp/.test(ua)) return
    const server = window.location.origin
    const intent =
      `intent://invite?server=${encodeURIComponent(server)}&token=${encodeURIComponent(token)}` +
      '#Intent;scheme=bebe;package=im.bebe.app;' +
      `S.browser_fallback_url=${encodeURIComponent(INSTALL_URL)};end`
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
        앱에서 이어하기
      </a>
      <p className="text-center text-[12px] text-base-400">앱이 없으면 설치 페이지로 안내해요</p>
    </div>
  )
}
