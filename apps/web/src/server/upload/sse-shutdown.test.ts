import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 이 모듈은 상태를 globalThis 에 두고, 처음 쓰일 때 SIGTERM·SIGINT 리스너를 건다. 진짜 시그널은
// 보내지 않는다 — 건 리스너를 찾아 직접 부르고, 테스트가 끝나면 떼어 낸다.
const SIGNALS = ['SIGTERM', 'SIGINT'] as const
type Signal = (typeof SIGNALS)[number]
const globalState = globalThis as { __bebeSseShutdown?: unknown }
let existing: Record<Signal, unknown[]>

function added(signal: Signal): Array<(signal: Signal) => void> {
  return process
    .listeners(signal)
    .filter((listener) => !existing[signal].includes(listener)) as Array<(signal: Signal) => void>
}

function receive(signal: Signal): void {
  const listeners = added(signal)
  expect(listeners).toHaveLength(1)
  listeners[0]?.(signal)
}

async function load() {
  vi.resetModules()
  return import('./sse-shutdown')
}

beforeEach(() => {
  delete globalState.__bebeSseShutdown
  existing = { SIGTERM: process.listeners('SIGTERM'), SIGINT: process.listeners('SIGINT') }
})
afterEach(() => {
  for (const signal of SIGNALS) {
    for (const listener of added(signal)) process.removeListener(signal, listener)
  }
  delete globalState.__bebeSseShutdown
  vi.restoreAllMocks()
})

describe('onServerShutdown', () => {
  it.each(
    SIGNALS,
  )('%s 를 받으면 걸어 둔 함수를 모두 부르고, 그 뒤로는 내려가는 중이다', async (signal) => {
    const { onServerShutdown, serverShuttingDown } = await load()
    const first = vi.fn()
    const second = vi.fn()
    onServerShutdown(first)
    onServerShutdown(second)
    expect(serverShuttingDown()).toBe(false)

    receive(signal)

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    expect(serverShuttingDown()).toBe(true)
  })

  it('뗀 함수는 부르지 않는다', async () => {
    const { onServerShutdown } = await load()
    const kept = vi.fn()
    const removed = vi.fn()
    onServerShutdown(kept)
    const off = onServerShutdown(removed)

    off()
    receive('SIGTERM')

    expect(kept).toHaveBeenCalledTimes(1)
    expect(removed).not.toHaveBeenCalled()
  })

  it('하나가 throw 해도 나머지 스트림은 끝낸다', async () => {
    const { onServerShutdown } = await load()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const after = vi.fn()
    onServerShutdown(() => {
      throw new Error('boom')
    })
    onServerShutdown(after)

    receive('SIGTERM')

    expect(after).toHaveBeenCalledTimes(1)
    // 그 스트림은 끝나지 않아 종료를 붙잡는다 — 원인을 남기는 흔적은 이 로그뿐이다.
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('sse shutdown'),
      expect.objectContaining({ message: 'boom' }),
    )
  })

  it('불러오기만 해서는 시그널 리스너를 달지 않는다 — 빌드·테스트 워커의 기본 종료 동작이 사라진다', async () => {
    const { serverShuttingDown } = await load()

    serverShuttingDown()

    expect(added('SIGTERM')).toHaveLength(0)
    expect(added('SIGINT')).toHaveLength(0)
  })

  it('부팅 때 걸어 두면 스트림이 열리기 전에 온 시그널도 놓치지 않는다', async () => {
    const { listenForServerShutdown, serverShuttingDown } = await load()
    listenForServerShutdown()

    receive('SIGTERM')

    // 인증을 기다리던 첫 SSE 요청이 이걸 보고 스트림 대신 503 을 돌려준다.
    expect(serverShuttingDown()).toBe(true)
  })

  it('부팅 때 건 리스너가 그 뒤에 열린 스트림도 끝낸다 — 리스너는 하나만', async () => {
    const { listenForServerShutdown, onServerShutdown } = await load()
    listenForServerShutdown()
    listenForServerShutdown()
    const end = vi.fn()
    onServerShutdown(end)

    expect(added('SIGTERM')).toHaveLength(1)
    receive('SIGTERM')
    expect(end).toHaveBeenCalledTimes(1)
  })

  it('몇 번을 걸어도, 모듈이 다시 평가돼도 시그널마다 리스너는 하나다 — dev HMR 에서 쌓이지 않게', async () => {
    const first = await load()
    const a = vi.fn()
    first.onServerShutdown(a)
    first.onServerShutdown(vi.fn())
    const again = await load()
    const b = vi.fn()
    again.onServerShutdown(b)

    expect(added('SIGTERM')).toHaveLength(1)
    expect(added('SIGINT')).toHaveLength(1)
    receive('SIGTERM')
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })
})
