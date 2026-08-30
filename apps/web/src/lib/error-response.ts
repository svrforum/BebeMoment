import { errorLogFields, levelForStatus } from '@/lib/error-log'
import { logger } from '@/lib/logger'
import { toHttpError } from '@/server/error'
import { getTranslations } from 'next-intl/server'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * 에러 응답을 서버 로그로 남긴다.
 *
 * Next 는 요청을 로그로 남기지 않아서, 라우트가 무엇을 왜 거절했는지 서버에 흔적이 없었다
 * — 스토리 400, 휴지통 영구삭제 500 둘 다 로그만으로는 알 수 없어 매번 재현부터 해야 했다.
 * 모든 API 라우트가 이 두 함수를 지나므로 여기 한 곳이면 전 경로가 덮인다.
 *
 * 경로는 proxy.ts 가 넣어 주는 `x-pathname` 에서 얻는다. 로깅이 실패해도 응답은 나가야
 * 하므로 절대 던지지 않는다.
 */
async function logError(status: number, message: string, error?: unknown): Promise<void> {
  try {
    const path = (await headers()).get('x-pathname')
    const fields = errorLogFields({ status, message, path, error })
    const level = levelForStatus(status)
    logger[level](fields, 'api error')
  } catch {
    // 로깅 실패가 응답을 막으면 안 된다.
  }
}

/**
 * 서비스 throw 를 요청 locale 로 번역해 JSON 응답으로. 서비스는 `ServiceError(status,
 * 'errors 네임스페이스 키')` 로 던지고(예: 'member.notFound'), 여기서 요청 locale 의
 * 'errors' 카탈로그로 변환한다. 키가 아니면(zod·외부 에러 등) 메시지를 그대로 통과.
 */
export async function errorJson(e: unknown): Promise<NextResponse> {
  const t = await getTranslations('errors')
  const { status, message } = toHttpError(e)
  await logError(status, message, e)
  const text = t.has(message) ? t(message) : message
  return NextResponse.json({ error: text }, { status })
}

/** 인라인 경계 에러(서비스 throw 가 아닌 라우트 자체 검증)용 — 키로 직접 응답. */
export async function errorJsonKey(key: string, status: number): Promise<NextResponse> {
  const t = await getTranslations('errors')
  await logError(status, key)
  return NextResponse.json({ error: t.has(key) ? t(key) : key }, { status })
}

/**
 * 카탈로그 키가 아니라 **그때그때 만들어지는 문구**를 그대로 돌려줄 때(zod 이슈 메시지 등).
 * 직접 `NextResponse.json({error})` 을 쓰면 그 경로만 로그에서 사라지므로 이걸 쓴다.
 */
export async function errorJsonText(message: string, status: number): Promise<NextResponse> {
  await logError(status, message)
  return NextResponse.json({ error: message }, { status })
}
