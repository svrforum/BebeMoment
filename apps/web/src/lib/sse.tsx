'use client'
import type { AssetEvent } from '@bebe/core'
import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef } from 'react'
import { reconnectDelayMs, shouldStopReconnecting } from './sse-backoff'

/**
 * Single shared `EventSource` for the family stream — all subscribers
 * register a callback via `useFamilySSE(onEvent)` and the provider keeps
 * exactly one connection open for the lifetime of the page session.
 *
 * Previously each call to `useFamilySSE` spun up its own EventSource and
 * the cb's `useCallback` dependency on `router` re-opened the connection
 * on every navigation. Both fixed here: the connection is mounted once at
 * the app shell, and subscribers' callbacks are read through a ref so a
 * shifting closure never tears down the socket.
 */

type Subscriber = (e: AssetEvent) => void

type FamilySSEContext = {
  subscribe: (cb: Subscriber) => () => void
}

const Ctx = createContext<FamilySSEContext | null>(null)

export function FamilySSEProvider({ children }: { children: ReactNode }) {
  const subscribers = useRef<Set<Subscriber>>(new Set())

  useEffect(() => {
    let src: EventSource | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let consecutiveFailures = 0

    const dispatch = (e: MessageEvent) => {
      let parsed: AssetEvent
      try {
        parsed = JSON.parse(e.data) as AssetEvent
      } catch {
        return
      }
      for (const cb of subscribers.current) {
        try {
          cb(parsed)
        } catch {
          // one bad subscriber shouldn't break the others
        }
      }
    }

    const connect = () => {
      const es = new EventSource('/api/stream/family')
      src = es
      es.onopen = () => {
        consecutiveFailures = 0
      }
      es.onmessage = dispatch
      es.onerror = () => {
        // 200 응답이 중간에 끊기면 EventSource 가 스스로 다시 붙는다(CONNECTING). 하지만
        // 401·5xx·프록시 거절처럼 non-2xx 를 받으면 CLOSED 로 굳어 영영 돌아오지 않는다 —
        // 그 경우만 우리가 백오프로 다시 연다. 세션이 만료돼 401 만 반복되면 포기한다.
        if (es.readyState !== EventSource.CLOSED) return
        es.close()
        if (src === es) src = null
        consecutiveFailures += 1
        if (shouldStopReconnecting(consecutiveFailures)) return
        timer = setTimeout(connect, reconnectDelayMs(consecutiveFailures))
      }
    }

    connect()
    return () => {
      if (timer) clearTimeout(timer)
      src?.close()
    }
  }, [])

  const subscribe = useCallback((cb: Subscriber) => {
    subscribers.current.add(cb)
    return () => {
      subscribers.current.delete(cb)
    }
  }, [])

  return <Ctx.Provider value={{ subscribe }}>{children}</Ctx.Provider>
}

export function useFamilySSE(onEvent: Subscriber): void {
  const ctx = useContext(Ctx)
  // Stable callback ref so re-renders don't re-subscribe.
  const cbRef = useRef(onEvent)
  useEffect(() => {
    cbRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    if (!ctx) return
    return ctx.subscribe((e) => cbRef.current(e))
  }, [ctx])
}
