import type { FastifyReply } from 'fastify'
import IORedis from 'ioredis'
import { progressChannel } from './channel'

export async function streamProgress(args: {
  reply: FastifyReply
  assetId: string
  redisUrl: string
  heartbeatMs?: number
}): Promise<void> {
  const { reply, assetId, redisUrl } = args
  const heartbeatMs = args.heartbeatMs ?? 15_000

  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    'x-accel-buffering': 'no',
    connection: 'keep-alive',
  })

  const sub = new IORedis(redisUrl)
  const channel = progressChannel(assetId)
  await sub.subscribe(channel)

  const heartbeat = setInterval(() => {
    reply.raw.write(`: heartbeat\n\n`)
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
