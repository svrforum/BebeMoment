import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { channelForFamily, createSubscriber } from '@/server/upload/pubsub'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { session } = await getAuth()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.family) return new Response('No family', { status: 400 })
  const familyId = ctx.family.id

  const encoder = new TextEncoder()
  let sub: ReturnType<typeof createSubscriber> | null = null
  let hb: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream({
    async start(controller) {
      sub = createSubscriber()
      await sub.subscribe(channelForFamily(familyId))
      sub.on('message', (_channel, message) => {
        controller.enqueue(encoder.encode(`data: ${message}\n\n`))
      })
      hb = setInterval(() => {
        controller.enqueue(encoder.encode(': ping\n\n'))
      }, 25_000)
    },
    cancel() {
      if (hb) clearInterval(hb)
      sub?.quit().catch(() => {})
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
