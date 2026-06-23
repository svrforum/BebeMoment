import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { channelForFamily, createSubscriber } from '@/server/upload/pubsub'
import { acquireSse, releaseSse } from '@/server/upload/sse-limit'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { session } = await getAuth()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family) return new Response('No family', { status: 400 })
  const familyId = ctx.family.id
  const userId = session.userId

  // 한 유저가 여는 동시 SSE(=Redis 구독) 수를 제한 — 연결/Redis 고갈 방지.
  if (!acquireSse(userId)) return new Response('Too many connections', { status: 429 })

  const encoder = new TextEncoder()
  let sub: ReturnType<typeof createSubscriber> | null = null
  let hb: ReturnType<typeof setInterval> | null = null
  let released = false
  const release = () => {
    if (released) return
    released = true
    releaseSse(userId)
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        sub = createSubscriber()
        await sub.subscribe(channelForFamily(familyId))
        sub.on('message', (_channel, message) => {
          controller.enqueue(encoder.encode(`data: ${message}\n\n`))
        })
        hb = setInterval(() => {
          controller.enqueue(encoder.encode(': ping\n\n'))
        }, 25_000)
      } catch (err) {
        release()
        controller.error(err)
      }
    },
    cancel() {
      if (hb) clearInterval(hb)
      release()
      sub?.quit().catch((err) => {
        console.error('redis sub quit failed:', err)
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
