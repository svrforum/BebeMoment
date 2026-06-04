'use client'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

type ProgressEvent =
  | { type: 'progress'; assetId: string; uploadedBytes: number; totalBytes: number }
  | {
      type: 'status'
      assetId: string
      status: 'processing' | 'ready' | 'failed'
      reason?: string
    }

export type UploadStatus = 'uploading' | 'processing' | 'ready' | 'failed'

type Props = {
  assetId: string
  uploadToken: string
  onComplete?: () => void
}

export function UploadProgressBar({ assetId, uploadToken, onComplete }: Props) {
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<UploadStatus>('uploading')
  const t = useTranslations('upload')

  useEffect(() => {
    const mediaBaseUrl = process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? ''
    const url = `${mediaBaseUrl}/media/v1/progress/sse?assetId=${encodeURIComponent(
      assetId,
    )}&token=${encodeURIComponent(uploadToken)}`
    const es = new EventSource(url)

    es.onmessage = (ev) => {
      try {
        const evt = JSON.parse(ev.data) as ProgressEvent
        if (evt.type === 'progress') {
          setProgress(evt.totalBytes > 0 ? evt.uploadedBytes / evt.totalBytes : 0)
        } else if (evt.type === 'status') {
          setStatus(evt.status)
          if (evt.status === 'ready' || evt.status === 'failed') {
            onComplete?.()
            es.close()
          }
        }
      } catch {
        // ignore malformed messages
      }
    }
    es.onerror = () => {
      // browser will retry or close; no-op
    }

    return () => es.close()
  }, [assetId, uploadToken, onComplete])

  return (
    <div aria-label={t('progress.aria')} className="flex items-center gap-2">
      <progress value={progress} max={1} className="h-1 flex-1" />
      <span className="text-xs text-base-500">{t(`progress.${status}`)}</span>
    </div>
  )
}
