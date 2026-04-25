'use client'
import { useFamilySSE } from '@/lib/sse'
import type { AssetEvent } from '@bebe/core'
import type { AssetUrls } from '@bebe/media-client'
import { ImagePlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { BucketSection } from './bucket-section'

type AssetRow = {
  id: string
  status: 'uploading' | 'processing' | 'ready' | 'failed'
  kind: 'image' | 'video'
  urls: AssetUrls | null
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
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-5 py-16 text-center">
        <div className="rounded-full bg-base-100 p-6 dark:bg-base-800">
          <ImagePlus className="h-10 w-10 text-base-400" />
        </div>
        <div>
          <p className="text-base font-semibold text-base-900 dark:text-base-50">
            아직 올라온 사진이 없어요
          </p>
          <p className="mt-1 text-sm text-base-500">우측 하단 + 버튼을 눌러 첫 사진을 올려보세요</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-4">
      {initialGroups.map((g, i) => (
        <BucketSection key={g.label} label={g.label} assets={g.assets} index={i} />
      ))}
    </div>
  )
}
