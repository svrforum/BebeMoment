import { ServiceError } from '@/server/error'

// 인증/제어 JSON 라우트의 본문은 작다(보통 < 1KB) — 32KB 면 충분. 무인증 라우트가
// 거대 본문을 통째로 버퍼링해 메모리를 소진하는 DoS 를 막는 캡.
const DEFAULT_MAX_BYTES = 32 * 1024

/**
 * Route Handler 용 본문 크기 제한 JSON 리더. Content-Length 가 캡을 넘으면 즉시 413,
 * 헤더가 없거나 위조될 수 있으니 스트림을 누적하며 캡 초과 시 413 으로 abort 한다(실제
 * 강제). zod 파싱 전에 호출해 per-request 메모리를 캡 안에 묶는다.
 */
export async function readJsonLimited(
  req: Request,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<unknown> {
  const cl = req.headers.get('content-length')
  if (cl && Number(cl) > maxBytes) throw new ServiceError(413, 'request.bodyTooLarge')

  const reader = req.body?.getReader()
  if (!reader) return {}
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new ServiceError(413, 'request.bodyTooLarge')
    }
    chunks.push(value)
  }
  const text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8')
  if (!text.trim()) return {}
  return JSON.parse(text)
}
