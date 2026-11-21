import { keyBelongsToAsset } from '@/domain/asset-key'
import { type VerifiedFileServeToken, verifyFileServeToken } from '@/lib/jwt'
import type { FastifyPluginAsync } from 'fastify'
import { MediaHttpError } from '../middleware/error-handler'
import { sendStoredFile } from '../send-stored-file'

export const filesRoute: FastifyPluginAsync = async (app) => {
  app.get('/media/v1/files/:signed', async (req, reply) => {
    const { signed } = req.params as { signed: string }

    let payload: VerifiedFileServeToken
    try {
      payload = await verifyFileServeToken(signed)
    } catch {
      throw new MediaHttpError({
        code: 'UNAUTHORIZED',
        status: 401,
        message: '유효하지 않거나 만료된 URL 이에요',
        retriable: false,
      })
    }

    // 토큰의 familyId/assetId 와 서빙할 key 를 결속(IDOR 방어). 원본은 families/ 접두,
    // 파생물은 derivatives/<asset>/ 접두 — 둘 다 허용(keyBelongsToAsset).
    if (!keyBelongsToAsset(payload.key, payload.familyId, payload.assetId)) {
      throw new MediaHttpError({
        code: 'UNAUTHORIZED',
        status: 401,
        message: '유효하지 않은 URL 이에요',
        retriable: false,
      })
    }

    return sendStoredFile(req, reply, { key: payload.key, exp: payload.exp })
  })
}
