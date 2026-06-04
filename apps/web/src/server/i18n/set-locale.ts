'use server'
import { LOCALE_COOKIE, type Locale } from '@/i18n/request'
import { cookies } from 'next/headers'

// 로케일 쿠키 설정(테마처럼 사용자별). 요청 config(request.ts)가 이 쿠키를 읽어 메시지/lang 결정.
// 클라가 호출 후 router.refresh() 하면 새 언어로 재렌더된다. 1년 TTL.
export async function setLocale(locale: Locale): Promise<void> {
  const store = await cookies()
  store.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
}
