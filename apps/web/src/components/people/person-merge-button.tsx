'use client'
import { Sheet } from '@/components/ui/sheet'
import { useToast } from '@/lib/toast'
import { Users } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export type MergeTarget = {
  id: string
  name: string | null
  photoCount: number
  thumbUrl: string | null
}

/** "다른 사람과 합치기" — 이름없음/잘못 나뉜 군집을 기존 사람으로 합치는 버튼 + 대상 선택 시트.
 *  대상 선택 후 POST /api/people/<source>/merge → 합쳐진 대상 사람으로 이동. */
export function PersonMergeButton({
  sourceId,
  targets,
}: {
  sourceId: string
  targets: MergeTarget[]
}) {
  const t = useTranslations('misc')
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [merging, setMerging] = useState(false)

  if (targets.length === 0) return null

  const merge = async () => {
    if (!selected) return
    setMerging(true)
    try {
      const res = await fetch(`/api/people/${sourceId}/merge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetId: selected }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? t('people.mergeFailed'))
      }
      setOpen(false)
      router.push(`/people/${selected}`)
      router.refresh()
    } catch (e) {
      toast({ title: (e as Error).message, variant: 'danger' })
      setMerging(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-base-100 px-3 py-1.5 text-sm font-medium text-base-700 transition-colors active:bg-base-200 dark:bg-base-800 dark:text-base-200"
      >
        <Users size={13} />
        {t('people.merge')}
      </button>
      <Sheet open={open} onOpenChange={setOpen} title={t('people.mergeTitle')}>
        <div className="flex flex-col gap-2">
          <p className="px-1 text-sm text-base-500">{t('people.mergeHint')}</p>
          <div className="max-h-[50vh] overflow-y-auto">
            {targets.map((p) => {
              const active = selected === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected(p.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors ${
                    active ? 'bg-point-500/10' : 'active:bg-base-100 dark:active:bg-base-800'
                  }`}
                >
                  <span className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-base-100 dark:bg-base-800">
                    {p.thumbUrl ? (
                      // biome-ignore lint/performance/noImgElement: 미디어 서버 signed URL — next/image 부적합
                      <img src={p.thumbUrl} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-base-900 dark:text-base-50">
                      {p.name ?? t('people.unnamed')}
                    </span>
                    <span className="block text-xs text-base-500">
                      {t('people.photoCount', { count: p.photoCount })}
                    </span>
                  </span>
                  <span
                    className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                      active
                        ? 'border-point-500 bg-point-500'
                        : 'border-base-300 dark:border-base-600'
                    }`}
                  />
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => void merge()}
            disabled={!selected || merging}
            className="mt-1 rounded-full bg-point-500 py-3 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
          >
            {merging ? t('people.merging') : t('people.mergeConfirm')}
          </button>
        </div>
      </Sheet>
    </>
  )
}
