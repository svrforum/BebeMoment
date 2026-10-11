import { acquireSse, releaseSse } from '@/server/upload/sse-limit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as route from './route'

const { GET } = route

// Redis 는 바깥 시스템이라 구독 연결만 가짜로 둔다. SUBSCRIBE 의 응답 시점을 테스트가 정한다 —
// 연결이 끊기는 순간과 구독이 끝나는 순간의 순서가 이 라우트의 버그였다.
const state = vi.hoisted(() => {
  type Handler = (channel: string, message: string) => void
  const makeSubscriber = () => {
    let finish = () => {}
    let fail: (err: Error) => void = () => {}
    const replied = new Promise<void>((resolve, reject) => {
      finish = resolve
      fail = reject
    })
    // 아무도 기다리지 않을 때 거절돼도 unhandledRejection 으로 번지지 않게.
    replied.catch(() => {})
    const handlers: Handler[] = []
    const emit = (message: string) => {
      for (const handler of handlers) handler(sub.channels[0] ?? '', message)
    }
    const sub = {
      channels: [] as string[],
      closed: false,
      async subscribe(channel: string) {
        sub.channels.push(channel)
        await replied
        return 1
      },
      on(event: string, handler: Handler) {
        if (event === 'message') handlers.push(handler)
        return sub
      },
      // ioredis 6 의 QUIT 은 대기 중인 SUBSCRIBE 뒤에 줄을 선다 — Redis 가 답하기 전엔 연결이
      // 그대로고, Redis 가 내려가 있으면 그동안 재연결을 되풀이한다.
      async quit() {
        await replied
        sub.closed = true
        return 'OK'
      },
      disconnect() {
        sub.closed = true
      },
      /**
       * Redis 가 SUBSCRIBE 에 답했다. 같은 소켓 읽기에 실려 온 메시지는 ioredis 가 응답을 처리한
       * 그 자리에서 곧바로 내보낸다 — 구독을 기다리던 쪽이 다음 줄로 넘어가기 전이다.
       */
      finishSubscribe: (...messages: string[]) => {
        finish()
        for (const message of messages) emit(message)
      },
      /** Redis 가 SUBSCRIBE 를 거절했다(인증·권한 오류 등). */
      failSubscribe: (err: Error) => fail(err),
      /** 누군가 가족 채널에 발행했다. */
      publish: emit,
    }
    return sub
  }
  return {
    familyId: 'fam-1',
    userId: '',
    subscribers: [] as ReturnType<typeof makeSubscriber>[],
    makeSubscriber,
  }
})

vi.mock('@/lib/auth', () => ({
  getAuth: async () => ({
    user: { id: state.userId },
    session: { id: 'sess', userId: state.userId, currentFamilyId: state.familyId },
  }),
}))
vi.mock('@/lib/db-init', () => ({ prismaPublic: {} }))
vi.mock('@/server/context', () => ({
  resolveContext: async () => ({
    user: { id: state.userId },
    family: { id: state.familyId },
    membership: { role: 'owner' },
    capabilities: [],
  }),
}))
vi.mock('@/server/upload/pubsub', async () => {
  const { channelForFamily } = await import('@bebe/core')
  return {
    channelForFamily,
    createSubscriber: () => {
      const sub = state.makeSubscriber()
      state.subscribers.push(sub)
      return sub
    },
  }
})

function request(signal?: AbortSignal): Request {
  return new Request('http://localhost/api/stream/family', signal ? { signal } : {})
}

function lastSubscriber(): ReturnType<typeof state.makeSubscriber> {
  const sub = state.subscribers.at(-1)
  if (!sub) throw new Error('구독이 열리지 않았다')
  return sub
}

/** 대기 중인 프라미스를 다 흘려보낸다. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve))

/** 그 사용자가 지금 더 열 수 있는 SSE 수 — 자리를 반납하지 않으면 줄어든다. */
function freeSlots(userId: string): number {
  let n = 0
  while (n < 100 && acquireSse(userId)) n += 1
  for (let i = 0; i < n; i += 1) releaseSse(userId)
  return n
}

async function readText(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const { value } = await reader.read()
  return new TextDecoder().decode(value)
}

let seq = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  seq += 1
  state.userId = `user-${seq}`
  state.subscribers.length = 0
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('GET /api/stream/family', () => {
  it('가족 채널에 온 이벤트를 흘려보내고, 25초마다 핑으로 연결을 붙잡는다', async () => {
    const res = await GET(request())
    const reader = res.body?.getReader()
    if (!reader) throw new Error('본문이 없다')
    lastSubscriber().finishSubscribe()
    await settle()

    expect(lastSubscriber().channels).toEqual(['bebe:events:family:fam-1'])
    lastSubscriber().publish('{"type":"asset.ready"}')
    expect(await readText(reader)).toBe('data: {"type":"asset.ready"}\n\n')
    vi.advanceTimersByTime(25_000)
    expect(await readText(reader)).toBe(': ping\n\n')
  })

  it('Next 가 스트림을 취소하면 핑·구독·연결 자리를 모두 정리한다', async () => {
    const before = freeSlots(state.userId)
    const res = await GET(request())
    lastSubscriber().finishSubscribe()
    await settle()

    await res.body?.cancel()

    expect(vi.getTimerCount()).toBe(0)
    expect(lastSubscriber().closed).toBe(true)
    expect(freeSlots(state.userId)).toBe(before)
  })

  it('구독이 끝나기 전에 끊겨도 핑을 걸지 않는다 — 닫힌 스트림에 쓰다 uncaughtException 이 났다', async () => {
    const before = freeSlots(state.userId)
    const res = await GET(request())

    await res.body?.cancel()
    lastSubscriber().finishSubscribe()
    await settle()

    expect(vi.getTimerCount()).toBe(0)
    expect(() => vi.advanceTimersByTime(25_000)).not.toThrow()
    expect(lastSubscriber().closed).toBe(true)
    expect(freeSlots(state.userId)).toBe(before)
  })

  it('보내는 중 끊기면 Next 는 signal 과 cancel 을 둘 다 울린다 — 자리는 한 번만 돌려준다', async () => {
    const before = freeSlots(state.userId)
    await GET(request()) // 같은 사용자의 다른 탭 — 계속 열려 있다
    const client = new AbortController()
    const res = await GET(request(client.signal))
    for (const sub of state.subscribers) sub.finishSubscribe()
    await settle()

    client.abort()
    await res.body?.cancel()

    expect(freeSlots(state.userId)).toBe(before - 1)
  })

  it('구독 확인과 함께 도착한 메시지도 놓치지 않는다', async () => {
    const res = await GET(request())
    const reader = res.body?.getReader()
    if (!reader) throw new Error('본문이 없다')

    lastSubscriber().finishSubscribe('{"type":"asset.ready"}')
    await settle()
    vi.advanceTimersByTime(25_000)

    expect(await readText(reader)).toBe('data: {"type":"asset.ready"}\n\n')
  })

  it('Redis 가 구독을 거절하면 스트림을 오류로 끝내고 구독과 자리를 정리한다', async () => {
    const before = freeSlots(state.userId)
    const res = await GET(request())
    const reader = res.body?.getReader()
    if (!reader) throw new Error('본문이 없다')

    lastSubscriber().failSubscribe(new Error('NOAUTH Authentication required.'))

    await expect(reader.read()).rejects.toThrow('NOAUTH')
    expect(lastSubscriber().closed).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    expect(freeSlots(state.userId)).toBe(before)
  })

  it('Redis 가 답하기 전에 끊겨도 구독 연결을 바로 놓는다', async () => {
    const res = await GET(request())

    await res.body?.cancel()
    await settle()

    expect(lastSubscriber().closed).toBe(true)
  })

  it('HEAD 요청에는 구독을 열지 않는다 — HEAD 는 본문을 보내지 않아 Next 가 스트림을 끝내 건드리지 않는다', async () => {
    const before = freeSlots(state.userId)
    // Next 와 같은 규칙: HEAD 를 내보내지 않으면 GET 이 HEAD 도 받는다.
    const head: (req: Request) => Response | Promise<Response> = route.HEAD ?? route.GET

    await head(new Request('http://localhost/api/stream/family', { method: 'HEAD' }))
    for (const sub of state.subscribers) sub.finishSubscribe()
    await settle()

    expect(state.subscribers).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(freeSlots(state.userId)).toBe(before)
  })

  it('끊긴 뒤 구독이 닫히기 전에 도착한 메시지는 버린다', async () => {
    const res = await GET(request())
    lastSubscriber().finishSubscribe()
    await settle()

    await res.body?.cancel()

    expect(() => lastSubscriber().publish('{"type":"asset.ready"}')).not.toThrow()
  })

  it('응답을 보내기 전에 끊기면 요청의 signal 로 정리한다 — 이때 Next 는 스트림을 읽지도 취소하지도 않는다', async () => {
    const before = freeSlots(state.userId)
    const client = new AbortController()
    await GET(request(client.signal))

    client.abort()
    lastSubscriber().finishSubscribe()
    await settle()

    expect(vi.getTimerCount()).toBe(0)
    expect(lastSubscriber().closed).toBe(true)
    expect(freeSlots(state.userId)).toBe(before)
  })

  it('인증을 기다리는 사이 이미 떠난 클라이언트에게는 아무것도 열어 두지 않는다', async () => {
    const before = freeSlots(state.userId)
    const client = new AbortController()
    client.abort()

    await GET(request(client.signal))
    for (const sub of state.subscribers) sub.finishSubscribe()
    await settle()

    expect(vi.getTimerCount()).toBe(0)
    expect(state.subscribers.every((sub) => sub.closed)).toBe(true)
    expect(freeSlots(state.userId)).toBe(before)
  })
})
