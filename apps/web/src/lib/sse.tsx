'use client'
import type { AssetEvent } from '@bebe/core'
import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef } from 'react'

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
    const src = new EventSource('/api/stream/family')
    src.onmessage = (e) => {
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
    return () => src.close()
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
