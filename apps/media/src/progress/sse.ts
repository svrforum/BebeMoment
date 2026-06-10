import type { FastifyReply, FastifyRequest } from 'fastify'
import IORedis from 'ioredis'
import { progressChannel } from './channel'

export async function streamProgress(args: {
  request: FastifyRequest
  reply: FastifyReply
  assetId: string
  redisUrl: string
  heartbeatMs?: number
}): Promise<void> {
  const { request, reply, assetId, redisUrl } = args
  const heartbeatMs = args.heartbeatMs ?? 15_000

  // SSE 인증은 ?token= 쿼리(업로드 JWT)로 하고 쿠키는 안 쓴다. 따라서 credentials 를
  // 허용하면 안 된다 — any-origin 반사 + allow-credentials:true 조합은 서버 CORS 정책
  // (credentials:false, server.ts)과 모순되는 위험 패턴이라 제거했다.
  const origin = (request.headers.origin as string | undefined) ?? '*'
  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    'x-accel-buffering': 'no',
    connection: 'keep-alive',
    'access-control-allow-origin': origin,
    vary: 'Origin',
  })
  reply.raw.write(': connected\n\n')
  if (typeof (reply.raw as { flushHeaders?: () => void }).flushHeaders === 'function') {
    ;(reply.raw as { flushHeaders: () => void }).flushHeaders()
  }

  const sub = new IORedis(redisUrl)
  const channel = progressChannel(assetId)
  await sub.subscribe(channel)

  const heartbeat = setInterval(() => {
    reply.raw.write(': heartbeat\n\n')
  }, heartbeatMs)

  sub.on('message', (_ch, message) => {
    reply.raw.write(`data: ${message}\n\n`)
  })

  await new Promise<void>((resolve) => {
    reply.raw.on('close', async () => {
      clearInterval(heartbeat)
      try {
        await sub.unsubscribe(channel)
      } catch {}
      try {
        await sub.quit()
      } catch {}
      resolve()
    })
  })
}
