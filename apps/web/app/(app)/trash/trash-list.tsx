'use client'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { PictureImage } from '@/components/ui/picture-image'
import { pickDisplayTrio, pickDisplayUrl, pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import { useToast } from '@/lib/toast'
import type { AssetUrls } from '@bebe/media-client'
import { X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
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
  const t = useTranslations('misc')
  const locale = useLocale()
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
    if (!window.confirm(t('trash.purgeConfirm', { name: asset.originalFilename }))) {
      return
    }
    setBusyId(asset.id)
    try {
      const res = await fetch(`/api/asset/${asset.id}/purge`, { method: 'POST' })
      if (res.ok) {
        toast({ title: t('trash.purgeSuccess'), variant: 'success' })
        setPreview(null)
        router.refresh()
      } else {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        toast({
          title: t('trash.purgeFailed'),
          description: body?.error ?? `HTTP ${res.status}`,
          variant: 'danger',
        })
      }
    } catch (e) {
      toast({
        title: t('trash.purgeFailed'),
        description: e instanceof Error ? e.message : 'unknown error',
        variant: 'danger',
      })
    } finally {
      setBusyId(null)
    }
  }

  if (assets.length === 0) {
    return <p className="text-sm text-base-500 px-5 py-8 text-center">{t('trash.empty')}</p>
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
                aria-label={t('trash.viewPhoto')}
                className="h-14 w-14 shrink-0 overflow-hidden rounded-lg transition active:scale-95"
              >
                {hasImage ? (
                  <PictureImage
                    assetId={a.id}
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
                  {t('trash.deletedOn', {
                    date: new Date(a.deletedAtISO).toLocaleDateString(locale),
                  })}
                </div>
              </button>
              <Button variant="secondary" size="sm" onClick={() => restore(a.id)}>
                {t('trash.restore')}
              </Button>
              {canPurge && (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busyId === a.id}
                  onClick={() => purge(a)}
                >
                  {t('trash.purge')}
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
              aria-label={t('trash.close')}
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
              {t('trash.restore')}
            </Button>
            {canPurge && (
              <Button
                variant="danger"
                disabled={busyId === preview.id}
                onClick={() => purge(preview)}
              >
                {t('trash.purge')}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
