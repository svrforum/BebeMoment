import { type UploadTokenPayload, verifyUploadToken } from '@/lib/jwt'
import type { FastifyRequest } from 'fastify'
import { MediaHttpError } from './error-handler'

export async function extractUploadToken(req: FastifyRequest): Promise<UploadTokenPayload> {
  let token: string | undefined
  const auth = req.headers.authorization
  if (auth?.startsWith('Bearer ')) {
    token = auth.slice(7)
  }
  if (!token) {
    const query = req.query as { token?: string } | undefined
    if (query && typeof query.token === 'string' && query.token.length > 0) {
      token = query.token
    }
  }

  if (!token) {
    throw new MediaHttpError({
      code: 'UPLOAD_TOKEN_INVALID',
      status: 401,
      message: '업로드 토큰이 필요해요',
      retriable: false,
    })
  }

  try {
    return await verifyUploadToken(token)
  } catch (e) {
    const msg = (e as Error).message
    // jose 는 만료에 JWTExpired(code ERR_JWT_EXPIRED)를 던진다. 메시지 substring
    // ('exp')으로 판정하면 `unexpected "aud" claim value` 같은 무관한 에러까지
    // 만료(retriable)로 오분류된다 — 타입 코드로만 만료를 판정한다.
    const expired = (e as { code?: string }).code === 'ERR_JWT_EXPIRED'
    throw new MediaHttpError({
      code: expired ? 'UPLOAD_TOKEN_EXPIRED' : 'UPLOAD_TOKEN_INVALID',
      status: 401,
      message: expired ? '업로드 토큰이 만료됐어요' : '업로드 토큰이 유효하지 않아요',
      retriable: expired,
      details: { reason: msg },
    })
  }
}
