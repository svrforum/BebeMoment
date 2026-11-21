import { isImageDerivativeName } from '@/domain/asset-key'
import { verifyImageAccess } from '@/lib/image-access'
import type { FastifyPluginAsync } from 'fastify'
import { MediaHttpError } from '../middleware/error-handler'
import { sendStoredFile } from '../send-stored-file'

const ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// 이미지 파생물의 짧은 주소. 토큰은 자산 하나를 묶고(lib/image-access.ts) 그 자산의 이미지
// 파생물 전부를 연다. 이름은 서명에 없으므로 허용 목록을 통과한 것만 키로 만든다 — 목록
// 밖(영상·원본·경로 조각)은 토큰이 유효해도 저장소를 보지 않고 거절한다.
export const imagesRoute: FastifyPluginAsync = async (app) => {
  app.get('/media/v1/img/:assetId/:name/:token', async (req, reply) => {
    const { assetId, name, token } = req.params as { assetId: string; name: string; token: string }

    const exp =
      ASSET_ID.test(assetId) && isImageDerivativeName(name)
        ? verifyImageAccess(assetId, token)
        : null
    if (exp === null) {
      throw new MediaHttpError({
        code: 'UNAUTHORIZED',
        status: 401,
        message: '유효하지 않거나 만료된 URL 이에요',
        retriable: false,
      })
    }

    return sendStoredFile(req, reply, { key: `derivatives/${assetId}/${name}`, exp })
  })
}
