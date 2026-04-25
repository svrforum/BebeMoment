'use client'
import { useFamilySSE } from '@/lib/sse'
import type { AssetEvent } from '@bebe/core'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { BucketSection } from './bucket-section'

type AssetRow = {
  id: string
  status: 'uploading' | 'processing' | 'ready' | 'failed'
  kind: 'image' | 'video'
  thumbUrl: string | null
}

type BucketGroup = { label: string; assets: AssetRow[] }

type Props = {
  initialGroups: BucketGroup[]
}

export function TimelineGrid({ initialGroups }: Props) {
  const router = useRouter()

  const handleEvent = useCallback(
    (event: AssetEvent) => {
      if (
        event.type === 'asset.updated' &&
        (event.status === 'ready' || event.status === 'failed')
      ) {
        router.refresh()
      }
    },
    [router],
  )
  useFamilySSE(handleEvent)

  if (initialGroups.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12 text-center">
        <p className="text-base-500">
          아직 올라온 사진이 없어요.
          <br />
          <span className="text-point-500">업로드 버튼을 눌러 시작하세요.</span>
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-4">
      {initialGroups.map((g) => (
        <BucketSection key={g.label} label={g.label} assets={g.assets} />
      ))}
    </div>
  )
}
