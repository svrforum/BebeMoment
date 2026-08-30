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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const allSelected = assets.length > 0 && selected.size === assets.length

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === assets.length ? new Set() : new Set(assets.map((a) => a.id)),
    )
  }

  // 되돌릴 수 없으니 몇 장인지 분명히 말하고 확인받는다.
  async function purgeSelected() {
    const ids = assets.filter((a) => selected.has(a.id)).map((a) => a.id)
    if (ids.length === 0) return
    if (!window.confirm(t('trash.purgeManyConfirm', { count: ids.length }))) return
    setBulkBusy(true)
    try {
      // 200장씩 나눠 보낸다 — 한 번에 다 보내면 파일 삭제가 길어져 요청이 끊기고,
      // 어디까지 지워졌는지 알 수 없게 된다.
      let purged = 0
      const failed: string[] = []
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200)
        const res = await fetch('/api/trash/purge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assetIds: chunk }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          toast({
            title: t('trash.purgeFailed'),
            description: body?.error ?? `HTTP ${res.status}`,
            variant: 'danger',
          })
          break
        }
        const d = (await res.json()) as {
          purged: number
          failed: { assetId: string }[]
        }
        purged += d.purged
        failed.push(...d.failed.map((f) => f.assetId))
      }
      // 실패한 것을 숨기지 않는다 — "지웠어요"라고만 하고 남아 있으면 다음에 또 헤맨다.
      toast({
        title: failed.length
          ? t('trash.purgeManyPartly', { purged, failed: failed.length })
          : t('trash.purgeManyDone', { count: purged }),
        variant: failed.length ? 'danger' : 'success',
      })
      setSelected(new Set())
      router.refresh()
    } finally {
      setBulkBusy(false)
    }
  }

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
      {canPurge && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-base-200 px-4 py-2.5 dark:border-base-800">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-4 w-4 accent-point-500"
            />
            <span>{allSelected ? t('trash.clearSelection') : t('trash.selectAll')}</span>
          </label>
          <Button
            variant="danger"
            size="sm"
            disabled={selected.size === 0 || bulkBusy}
            onClick={() => void purgeSelected()}
          >
            {bulkBusy ? t('trash.purging') : t('trash.purgeSelected', { count: selected.size })}
          </Button>
        </div>
      )}
      {assets.map((a) => {
        const trio = pickThumbTrio(a.urls)
        const fallbackUrl = pickThumbUrl(a.urls)
        const hasImage = trio !== null || fallbackUrl !== null
        return (
          <Card key={a.id}>
            <CardBody className="flex items-center gap-3">
              {canPurge && (
                <input
                  type="checkbox"
                  checked={selected.has(a.id)}
                  onChange={() => toggle(a.id)}
                  aria-label={t('trash.select')}
                  className="h-4 w-4 shrink-0 accent-point-500"
                />
              )}
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
