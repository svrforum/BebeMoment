import { toHttpError } from '@/server/error'
import { getTranslations } from 'next-intl/server'
import { NextResponse } from 'next/server'

/**
 * 서비스 throw 를 요청 locale 로 번역해 JSON 응답으로. 서비스는 `ServiceError(status,
 * 'errors 네임스페이스 키')` 로 던지고(예: 'member.notFound'), 여기서 요청 locale 의
 * 'errors' 카탈로그로 변환한다. 키가 아니면(zod·외부 에러 등) 메시지를 그대로 통과.
 */
export async function errorJson(e: unknown): Promise<NextResponse> {
  const t = await getTranslations('errors')
  const { status, message } = toHttpError(e)
  const text = t.has(message) ? t(message) : message
  return NextResponse.json({ error: text }, { status })
}

/** 인라인 경계 에러(서비스 throw 가 아닌 라우트 자체 검증)용 — 키로 직접 응답. */
export async function errorJsonKey(key: string, status: number): Promise<NextResponse> {
  const t = await getTranslations('errors')
  return NextResponse.json({ error: t.has(key) ? t(key) : key }, { status })
}
