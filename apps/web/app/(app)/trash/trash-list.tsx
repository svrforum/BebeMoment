'use client'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { PictureImage } from '@/components/ui/picture-image'
import { pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import type { AssetUrls } from '@bebe/media-client'
import { useRouter } from 'next/navigation'

type Asset = {
  id: string
  originalFilename: string
  urls: AssetUrls | null
  deletedAtISO: string
}

type Props = { assets: Asset[] }

export function TrashList({ assets }: Props) {
  const router = useRouter()

  async function restore(id: string) {
    const res = await fetch(`/api/asset/${id}/restore`, { method: 'POST' })
    if (res.ok) router.refresh()
  }

  if (assets.length === 0) {
    return <p className="text-sm text-base-500 px-5 py-8 text-center">휴지통이 비어 있어요.</p>
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-4 space-y-2">
      {assets.map((a) => {
        const trio = pickThumbTrio(a.urls)
        const fallbackUrl = pickThumbUrl(a.urls)
        const hasImage = trio !== null || fallbackUrl !== null
        return (
          <Card key={a.id}>
            <CardBody className="flex items-center gap-3">
              {hasImage ? (
                <PictureImage
                  trio={trio}
                  fallbackUrl={fallbackUrl}
                  alt=""
                  dominantColor={a.urls?.dominantColor ?? null}
                  className="h-14 w-14 rounded-lg object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="h-14 w-14 rounded-lg bg-base-100 dark:bg-base-900" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{a.originalFilename}</div>
                <div className="text-xs text-base-500">
                  삭제됨 {new Date(a.deletedAtISO).toLocaleDateString('ko-KR')}
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => restore(a.id)}>
                복원
              </Button>
            </CardBody>
          </Card>
        )
      })}
    </div>
  )
}
