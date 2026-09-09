import { touchUploadProgress } from '@/domain/upload/progress'
import { onUploadFinishMedia } from '@/domain/upload/tus-hooks'
import type { UploadTokenPayload } from '@/lib/jwt'
import { prisma } from '@/lib/prisma'
import { createRedisConnection } from '@/lib/redis'
import { logger } from '@/lib/logger'
import { getTusStore } from '@/lib/tus-store'
import { getEnv } from '@/lib/env'
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
  const env = getEnv()
  const redis = createRedisConnection(env.REDIS_URL)
  const queue = new Queue(ASSET_QUEUE, { connection: redis })

  // tus PATCH 요청의 Content-Type 은 application/offset+octet-stream.
  // Fastify 의 기본 contentTypeParser 가 unknown MIME 을 415 로 거부하므로
  // tus 가 raw body 를 읽기 전에 우회시키는 passthrough parser 를 등록.
  app.addContentTypeParser('application/offset+octet-stream', (_req, payload, done) =>
    done(null, payload),
  )

  const globalMaxBytes = env.MEDIA_MAX_UPLOAD_BYTES

  const tusServer = new TusServer({
    path: '/media/v1/tus',
    datastore: getTusStore(),
    locker: new MemoryLocker(),
    // 토큰에 박힌 maxBytes(=선언된 파일 크기)로 PATCH 스트림을 인라인 제한 — 초과하면
    // tus 가 413 으로 끊는다(완료 후 검사라 5GB 까지 tus-tmp 를 점유하던 갭 해소). 토큰이
    // 없으면 전역 상한(env 조정)으로 폴백.
    maxSize: (req) => {
      // 웹표준 Request 가 아니라 그 아래 node req 에 토큰이 붙어 있다(namingFunction 과 같은 경로).
      const nodeReq = req.runtime?.node?.req as unknown as NodeReqWithToken | undefined
      return nodeReq?.__bebeUploadToken?.maxBytes ?? globalMaxBytes
    },
    // POST 생성 응답의 Location 을 상대경로(/media/v1/tus/<id>)로 — 컨테이너 내부에선
    // Host 가 localhost:3001 이라 절대 Location 을 주면 클라가 도달 못 해 PATCH 가
    // 네트워크 에러로 죽는다. 상대경로면 브라우저가 현재 오리진(도메인) 기준으로 PATCH.
    relativeLocation: true,
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
    // 청크가 도착할 때마다 자산 행을 밀어 "아직 올라오는 중"과 "죽은 업로드"를 구분
    // 가능하게 한다 — 이게 없으면 정리 기준을 몇 시간까지 늘려야 하고, 그동안 미완성
    // 자산이 정상 사진처럼 보인다. DB 가 흔들려도 업로드는 계속돼야 하므로 삼킨다.
    async onIncomingRequest(req, uploadId) {
      if (req.method !== 'PATCH' || !uploadId) return
      try {
        await touchUploadProgress(uploadId, prisma)
      } catch (err) {
        logger.debug({ uploadId, err: (err as Error).message }, 'upload heartbeat skipped')
      }
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
        logger,
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

    // PATCH 를 못 보내는 클라이언트(안드로이드 HttpURLConnection 등)를 위한 표준 tus
    // 우회 — POST + X-HTTP-Method-Override: PATCH. 토큰 검증 뒤 raw 메서드를 바꿔 tus 가
    // 올바른 핸들러로 보내게 한다.
    const override = (req.headers['x-http-method-override'] as string | undefined)?.toUpperCase()
    const raw = req.raw as unknown as { method: string }
    if (override === 'PATCH' || override === 'HEAD' || override === 'DELETE') {
      raw.method = override
    } else if (raw.method === 'GET' && req.headers['tus-resumable']) {
      // 앞단 리버스 프록시가 HEAD 를 GET 으로 바꿔 보낸다 — 라이브 로그의 resume 요청이 전부
      // GET /media/v1/tus/<id> 로 도착해 404 였고 이어올리기가 한 번도 되지 않았다. tus
      // 클라이언트는 GET 을 쓰지 않으므로 Tus-Resumable 을 단 GET 은 HEAD(offset 조회)다.
      raw.method = 'HEAD'
    }

    reply.hijack()
    await tusServer.handle(req.raw, reply.raw)
  }

  // `/media/v1/tus` (POST = 생성, endpoint 폴백) + `/media/v1/tus/<id>` (HEAD/PATCH = resume).
  // 둘 다 같은 핸들러로. 바ID 없는 생성 POST 가 누락돼 404 나던 것을 수정.
  app.all('/media/v1/tus', handleTus)
  app.all('/media/v1/tus/*', handleTus)
}
