'use client'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { PictureImage } from '@/components/ui/picture-image'
import { pickDisplayTrio, pickDisplayUrl, pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import { useToast } from '@/lib/toast'
import type { AssetUrls } from '@bebe/media-client'
import { X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Asset = {
  id: string
  originalFilename: string
  urls: AssetUrls | null
  deletedAtISO: string
}

type Props = { assets: Asset[]; canPurge: boolean }

export function TrashList({ assets, canPurge }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [preview, setPreview] = useState<Asset | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function restore(id: string) {
    const res = await fetch(`/api/asset/${id}/restore`, { method: 'POST' })
    if (res.ok) {
      setPreview(null)
      router.refresh()
    }
  }

  async function purge(asset: Asset) {
    if (
      !window.confirm(
        `"${asset.originalFilename}" 을 영구 삭제할까요?\n\n원본과 모든 미리보기 파일을 저장소에서 지웁니다. 이 작업은 되돌릴 수 없어요.`,
      )
    ) {
      return
    }
    setBusyId(asset.id)
    try {
      const res = await fetch(`/api/asset/${asset.id}/purge`, { method: 'POST' })
      if (res.ok) {
        toast({ title: '영구 삭제 완료', variant: 'success' })
        setPreview(null)
        router.refresh()
      } else {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        toast({
          title: '영구 삭제 실패',
          description: body?.error ?? `HTTP ${res.status}`,
          variant: 'danger',
        })
      }
    } catch (e) {
      toast({
        title: '영구 삭제 실패',
        description: e instanceof Error ? e.message : 'unknown error',
        variant: 'danger',
      })
    } finally {
      setBusyId(null)
    }
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
              <button
                type="button"
                onClick={() => setPreview(a)}
                aria-label="사진 보기"
                className="h-14 w-14 shrink-0 overflow-hidden rounded-lg transition active:scale-95"
              >
                {hasImage ? (
                  <PictureImage
                    trio={trio}
                    fallbackUrl={fallbackUrl}
                    alt=""
                    dominantColor={a.urls?.dominantColor ?? null}
                    className="h-14 w-14 object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-14 w-14 bg-base-100 dark:bg-base-900" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setPreview(a)}
                className="flex-1 min-w-0 text-left"
              >
                <div className="font-medium truncate">{a.originalFilename}</div>
                <div className="text-xs text-base-500">
                  삭제됨 {new Date(a.deletedAtISO).toLocaleDateString('ko-KR')}
                </div>
              </button>
              <Button variant="secondary" size="sm" onClick={() => restore(a.id)}>
                복원
              </Button>
              {canPurge && (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busyId === a.id}
                  onClick={() => purge(a)}
                >
                  영구 삭제
                </Button>
              )}
            </CardBody>
          </Card>
        )
      })}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/95"
          onClick={() => setPreview(null)}
        >
          <div className="flex justify-end p-4">
            <button
              type="button"
              onClick={() => setPreview(null)}
              aria-label="닫기"
              className="rounded-full bg-white/10 p-2 text-white"
            >
              <X size={22} />
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center px-4">
            <PictureImage
              trio={pickDisplayTrio(preview.urls)}
              fallbackUrl={pickDisplayUrl(preview.urls)}
              alt={preview.originalFilename}
              dominantColor={preview.urls?.dominantColor ?? null}
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <div className="flex justify-center gap-3 p-5" onClick={(e) => e.stopPropagation()}>
            <Button variant="secondary" onClick={() => restore(preview.id)}>
              복원
            </Button>
            {canPurge && (
              <Button
                variant="danger"
                disabled={busyId === preview.id}
                onClick={() => purge(preview)}
              >
                영구 삭제
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
