import { parseEnv } from '@bebe/config'
import { ASSET_QUEUE } from '@bebe/core'
import { MemoryLocker, Server as TusServer, type Upload } from '@tus/server'
import { Queue } from 'bullmq'
import type { FastifyPluginAsync } from 'fastify'
import { onUploadFinishMedia } from '@/domain/upload/tus-hooks'
import type { UploadTokenPayload } from '@/lib/jwt'
import { prisma } from '@/lib/prisma'
import { createRedisConnection } from '@/lib/redis'
import { getTusStore } from '@/lib/tus-store'
import { MediaHttpError } from '../middleware/error-handler'
import { extractUploadToken } from '../middleware/upload-token'

type NodeReqWithToken = {
  __bebeUploadToken?: UploadTokenPayload
}

export const tusRoute: FastifyPluginAsync = async (app) => {
  const env = parseEnv(process.env as Record<string, string | undefined>)
  const redis = createRedisConnection(env.REDIS_URL)
  const queue = new Queue(ASSET_QUEUE, { connection: redis })

  // tus PATCH 요청의 Content-Type 은 application/offset+octet-stream.
  // Fastify 의 기본 contentTypeParser 가 unknown MIME 을 415 로 거부하므로
  // tus 가 raw body 를 읽기 전에 우회시키는 passthrough parser 를 등록.
  app.addContentTypeParser(
    'application/offset+octet-stream',
    (_req, payload, done) => done(null, payload),
  )

  const tusServer = new TusServer({
    path: '/media/v1/tus',
    datastore: getTusStore(),
    locker: new MemoryLocker(),
    maxSize: 5 * 1024 * 1024 * 1024,
    async onUploadFinish(req, upload: Upload) {
      const nodeReq = req.runtime?.node?.req as unknown as NodeReqWithToken | undefined
      const token = nodeReq?.__bebeUploadToken
      if (!token) {
        throw { status_code: 401, body: 'Upload token missing\n' }
      }
      await onUploadFinishMedia({
        upload,
        token,
        prisma,
        queue,
        logger: app.log,
      })
      return {
        status_code: 204,
      }
    },
  })

  app.all('/media/v1/tus/*', async (req, reply) => {
    const token = await extractUploadToken(req)

    const wildcard = (req.params as { '*': string })['*'] ?? ''
    const urlAssetId = wildcard.split('/')[0] ?? ''
    if (urlAssetId && urlAssetId !== token.assetId) {
      throw new MediaHttpError({
        code: 'FAMILY_MISMATCH',
        status: 403,
        message: 'asset id 가 토큰과 일치하지 않아요',
        retriable: false,
      })
    }

    ;(req.raw as unknown as NodeReqWithToken).__bebeUploadToken = token

    reply.hijack()
    await tusServer.handle(req.raw, reply.raw)
  })
}
