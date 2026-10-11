import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { channelForFamily, createSubscriber } from '@/server/upload/pubsub'
import { acquireSse, releaseSse } from '@/server/upload/sse-limit'

export const dynamic = 'force-dynamic'

// HEAD 를 내보내지 않으면 Next 가 GET 으로 대신 받는데, HEAD 응답은 본문을 보내지 않아 Next 가
// 스트림을 읽지도 취소하지도 않고, 정상 종료라 요청의 signal 도 울리지 않는다 — 구독과 연결
// 자리가 프로세스가 내려갈 때까지 남는다.
export function HEAD(): Response {
  return new Response(null, { status: 405, headers: { Allow: 'GET' } })
}

export async function GET(req: Request) {
  const { session } = await getAuth()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family) return new Response('No family', { status: 400 })
  const familyId = ctx.family.id
  const userId = session.userId

  // 인증을 기다리는 사이 클라이언트가 이미 떠났다. Next 는 닫힌 소켓을 보면 응답을 보내지 않고
  // 스트림을 취소하지도 않으므로, 여기서 구독을 열면 아무도 닫지 않는다. 받을 사람은 없다.
  if (req.signal.aborted) return new Response(null, { status: 499 })

  // 한 유저가 여는 동시 SSE(=Redis 구독) 수를 제한 — 연결/Redis 고갈 방지.
  if (!acquireSse(userId)) return new Response('Too many connections', { status: 429 })

  const encoder = new TextEncoder()
  let sub: ReturnType<typeof createSubscriber> | null = null
  let hb: ReturnType<typeof setInterval> | null = null
  let closed = false
  // 끊김은 두 길로 온다 — 요청의 signal(클라이언트가 떠나면 늘 울린다)과 스트림 cancel(Next 가
  // 보내던 중이었을 때만, signal 다음에 온다). 응답을 보내기 전에 끊기면 Next 는 스트림을
  // 건드리지 않아 signal 만 온다. 둘 다 오는 게 보통이라 정리는 한 번만 — 자리를 두 번 돌려주면
  // 같은 사용자의 살아 있는 다른 연결 몫까지 풀린다.
  const close = () => {
    if (closed) return
    closed = true
    if (hb) clearInterval(hb)
    releaseSse(userId)
    // quit 이 아니라 disconnect — QUIT 은 대기 중인 SUBSCRIBE 뒤에 줄을 서서, Redis 가 내려가
    // 있으면 떠난 연결의 구독자가 Redis 가 돌아올 때까지 재연결을 되풀이한다.
    sub?.disconnect()
  }
  req.signal.addEventListener('abort', close, { once: true })

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // 닫힌 스트림에 쓰면 throw 한다 — 연결이 다 끊기기 전에 도착한 메시지는 버린다.
      const send = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text))
      }
      try {
        sub = createSubscriber()
        // 구독보다 먼저 단다 — SUBSCRIBE 응답과 같은 소켓 읽기에 실려 온 메시지는 ioredis 가 그
        // 자리에서 내보내, await 다음 줄에서 달면 이미 지나간 뒤다.
        sub.on('message', (_channel, message) => send(`data: ${message}\n\n`))
        await sub.subscribe(channelForFamily(familyId))
        // 구독을 기다리는 사이 끊겼으면 여기서 멈춘다. 이 뒤에 건 핑 타이머는 끌 사람이 없어,
        // 닫힌 스트림에 25초마다 쓰며 uncaughtException 을 냈다.
        if (closed) return
        hb = setInterval(() => send(': ping\n\n'), 25_000)
      } catch (err) {
        close()
        controller.error(err)
      }
    },
    cancel: close,
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
