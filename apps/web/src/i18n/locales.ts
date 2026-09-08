export const LOCALES = ['ko', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'ko'
export const LOCALE_COOKIE = 'locale'

export function isLocale(v: string | undefined): v is Locale {
  return v === 'ko' || v === 'en'
}
