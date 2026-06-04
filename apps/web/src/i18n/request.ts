import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'

export const LOCALES = ['ko', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'ko'
export const LOCALE_COOKIE = 'locale'

function isLocale(v: string | undefined): v is Locale {
  return v === 'ko' || v === 'en'
}

// 라우팅 없는(쿠키 기반) 로케일 — 사용자가 설정에서 고른 `locale` 쿠키 우선, 없으면 브라우저
// Accept-Language 로 추정(en* → en, 그 외 → ko). 테마와 동일한 "URL 안 바꾸는" 방식(§i18n).
export async function resolveLocale(): Promise<Locale> {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value
  if (isLocale(cookieLocale)) return cookieLocale
  const accept = (await headers()).get('accept-language')?.toLowerCase() ?? ''
  return accept.startsWith('en') ? 'en' : DEFAULT_LOCALE
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale()
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
