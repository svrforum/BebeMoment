import { onUploadFinishMedia } from '@/domain/upload/tus-hooks'
import type { UploadTokenPayload } from '@/lib/jwt'
import { prisma } from '@/lib/prisma'
import { createRedisConnection } from '@/lib/redis'
import { getTusStore } from '@/lib/tus-store'
import { parseEnv } from '@bebe/config'
import { ASSET_QUEUE } from '@bebe/core'
import { MemoryLocker, Server as TusServer, type Upload } from '@tus/server'
import { Queue } from 'bullmq'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
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
  app.addContentTypeParser('application/offset+octet-stream', (_req, payload, done) =>
    done(null, payload),
  )

  const tusServer = new TusServer({
    path: '/media/v1/tus',
    datastore: getTusStore(),
    locker: new MemoryLocker(),
    maxSize: 5 * 1024 * 1024 * 1024,
    // 업로드 id = 토큰의 assetId 로 고정. init 이 미리 등록한 deterministic 경로
    // (tus-tmp/<assetId>)와 일치해야 moveTusToFinal 이 바이트를 찾는다. 클라이언트가
    // resume(HEAD)에 실패해 POST 로 새로 생성(endpoint 폴백)하더라도 같은 assetId 로
    // 만들어져 정상 완료된다 — "cannot create without an endpoint" 치명적 오류 방지.
    namingFunction: (req) => {
      const nodeReq = req.runtime?.node?.req as unknown as NodeReqWithToken | undefined
      const token = nodeReq?.__bebeUploadToken
      if (!token?.assetId) throw new Error('upload token required')
      return token.assetId
    },
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

  const handleTus = async (req: FastifyRequest, reply: FastifyReply) => {
    const token = await extractUploadToken(req)

    const wildcard = (req.params as { '*'?: string })['*'] ?? ''
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
  }

  // `/media/v1/tus` (POST = 생성, endpoint 폴백) + `/media/v1/tus/<id>` (HEAD/PATCH = resume).
  // 둘 다 같은 핸들러로. 바ID 없는 생성 POST 가 누락돼 404 나던 것을 수정.
  app.all('/media/v1/tus', handleTus)
  app.all('/media/v1/tus/*', handleTus)
}
