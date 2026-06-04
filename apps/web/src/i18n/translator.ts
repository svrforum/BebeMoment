import type { PrismaClient } from '@bebe/db-public'
import { createTranslator } from 'next-intl'
import { z } from 'zod'
import { DEFAULT_LOCALE, LOCALES, type Locale } from './request'
import en from '../../messages/en.json'
import ko from '../../messages/ko.json'

const CATALOGS: Record<Locale, Record<string, unknown>> = { ko, en }

export type ServerT = (key: string, values?: Record<string, string | number>) => string

// 요청 컨텍스트 밖(푸시 워커·메일러)에서 쓰는 정적 번역기. next-intl 의 request-scoped
// getTranslations 와 달리 명시 locale 로 메시지를 직접 로드한다. next-intl 의 키 타입은
// 글로벌 메시지 증강에 의존해 namespace 동적 사용 시 `never` 가 되므로 느슨한 호출 타입으로 노출.
export function getServerTranslator(locale: Locale, namespace: string): ServerT {
  return createTranslator({ locale, messages: CATALOGS[locale], namespace }) as unknown as ServerT
}

const LocaleSchema = z.enum(LOCALES as unknown as [Locale, ...Locale[]])

// 인스턴스 단위 서버 발신(푸시·메일) 언어. UI 는 사용자별 쿠키지만 서버가 능동 발신하는
// 콘텐츠는 요청 컨텍스트가 없어 가족 공통값을 쓴다(단일 가족 모델). 관리자가 /admin/general
// 에서 설정(appearance.default_locale), 미설정 시 'ko'.
export async function getInstanceLocale(prisma: PrismaClient): Promise<Locale> {
  const row = await prisma.appSetting.findUnique({ where: { key: 'appearance.default_locale' } })
  if (!row) return DEFAULT_LOCALE
  const parsed = LocaleSchema.safeParse(row.value)
  return parsed.success ? parsed.data : DEFAULT_LOCALE
}
