'use client'
import type { AssetEvent } from '@bebe/core'
import { useEffect } from 'react'

export function useFamilySSE(onEvent: (event: AssetEvent) => void): void {
  useEffect(() => {
    const src = new EventSource('/api/stream/family')
    src.onmessage = (e) => {
      try {
        onEvent(JSON.parse(e.data) as AssetEvent)
      } catch {
        // ignore malformed messages
      }
    }
    return () => src.close()
  }, [onEvent])
}
