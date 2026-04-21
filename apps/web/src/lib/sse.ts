'use client'
import { useEffect } from 'react'

type AssetEvent = {
  type: 'asset.updated'
  assetId: string
  status: 'processing' | 'ready' | 'failed'
  derivatives?: Record<string, string>
}

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
