import { initAsset } from '@/domain/upload/init'
import { prisma } from '@/lib/prisma'
import { initAssetRequest, initAssetResponse } from '@bebe/media-client'
import type { FastifyPluginAsync } from 'fastify'
import { assertServiceToken } from '../middleware/service-token'

export const assetsInitRoute: FastifyPluginAsync = async (app) => {
  app.post('/media/v1/assets/init', async (req, reply) => {
    assertServiceToken(req.headers.authorization)
    const body = initAssetRequest.parse(req.body)

    // 기본은 상대 경로(`/media/v1/tus/<id>`) — 브라우저가 현재 오리진(IP/도메인) 기준
    // 으로 업로드하므로 https 도메인에서 http IP 로 막히는 mixed-content 가 없다.
    // 미디어를 별도 호스트로 분리한 경우에만 MEDIA_PUBLIC_BASE_URL 로 절대화.
    const publicBaseUrl = process.env.MEDIA_PUBLIC_BASE_URL ?? ''
    const result = await initAsset(body, prisma, publicBaseUrl)

    const payload = initAssetResponse.parse({ v: 1, ...result })
    reply.status(201).send(payload)
  })
}
