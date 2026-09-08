import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale, isLocale } from './locales'

// 상수는 `./locales` 가 정본이다 — 이 파일은 모듈 평가 시 `getRequestConfig` 를 호출하므로,
// 로케일 상수만 필요한 곳(워커·위젯·타임라인 그룹핑)이 여기를 import 하면 next-intl 요청
// 설정까지 딸려 들어간다. 기존 import 경로를 위해 재수출만 한다.
export { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE, isLocale } from './locales'
export type { Locale } from './locales'

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
