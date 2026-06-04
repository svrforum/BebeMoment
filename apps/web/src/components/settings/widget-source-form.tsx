'use client'
import { saveWidgetConfig } from '@/(app)/settings/widget/actions'
import { cn } from '@/lib/cn'
import { useToast } from '@/lib/toast'
import { PictureImage } from '@/components/ui/picture-image'
import { Check } from 'lucide-react'
import { useState, useTransition } from 'react'

type Bookmark = { id: string; thumb: string }

const OPTIONS = [
  { value: 'recent', label: '전체 최신 사진', desc: '모든 사진 중 무작위로 바뀌어요 (기본)' },
  { value: 'bookmark_random', label: '북마크 랜덤', desc: '북마크한 사진 중 무작위로 바뀌어요' },
  { value: 'bookmark_pinned', label: '북마크 고정', desc: '고른 북마크 사진 한 장만 보여요' },
] as const

export function WidgetSourceForm({
  initialSource,
  initialPinned,
  bookmarks,
}: {
  initialSource: string
  initialPinned: string | null
  bookmarks: Bookmark[]
}) {
  const [source, setSource] = useState(initialSource)
  const [pinned, setPinned] = useState<string | null>(initialPinned)
  const [pending, startTransition] = useTransition()
  const toast = useToast()

  const save = (nextSource: string, nextPinned: string | null) => {
    startTransition(async () => {
      const res = await saveWidgetConfig({ source: nextSource, pinnedAssetId: nextPinned })
      toast(
        res.ok
          ? { title: '위젯 설정을 저장했어요', variant: 'success' }
          : { title: '저장하지 못했어요', variant: 'danger' },
      )
    })
  }

  const pickSource = (v: string) => {
    setSource(v)
    if (v !== 'bookmark_pinned') {
      setPinned(null)
      save(v, null)
    } else {
      // 고정으로 바꾸면 기존 선택(있으면) 유지하며 저장 — 없으면 아래에서 사진을 고른다.
      save(v, pinned)
    }
  }

  const pickPhoto = (id: string) => {
    setPinned(id)
    save('bookmark_pinned', id)
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {OPTIONS.map((o) => {
          const active = source === o.value
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => pickSource(o.value)}
              disabled={pending}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left transition active:scale-[0.99] disabled:opacity-60',
                active
                  ? 'border-point-500 bg-point-50 dark:bg-point-500/10'
                  : 'border-base-200/70 bg-base-0 dark:border-base-800/70 dark:bg-base-900',
              )}
            >
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-base-900 dark:text-base-50">
                  {o.label}
                </p>
                <p className="mt-0.5 text-[13px] text-base-500">{o.desc}</p>
              </div>
              <span
                className={cn(
                  'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2',
                  active ? 'border-point-500 bg-point-500' : 'border-base-300 dark:border-base-700',
                )}
              >
                {active && <Check size={12} strokeWidth={3.5} className="text-white" />}
              </span>
            </button>
          )
        })}
      </div>

      {source === 'bookmark_pinned' && (
        <div className="space-y-2">
          <p className="px-1 text-[13px] font-semibold text-base-500">고정할 사진 선택</p>
          {bookmarks.length === 0 ? (
            <p className="rounded-2xl border border-base-200/70 bg-base-0 px-4 py-6 text-center text-[13px] text-base-400 dark:border-base-800/70 dark:bg-base-900">
              북마크한 사진이 없어요. 사진을 북마크(저장)하면 여기서 고를 수 있어요.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {bookmarks.map((b) => {
                const sel = pinned === b.id
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => pickPhoto(b.id)}
                    disabled={pending}
                    aria-label="이 사진으로 고정"
                    className={cn(
                      'relative aspect-square overflow-hidden rounded-xl transition active:scale-95',
                      sel ? 'ring-[3px] ring-point-500' : 'ring-1 ring-base-200/60',
                    )}
                  >
                    <PictureImage
                      trio={null}
                      fallbackUrl={b.thumb}
                      alt=""
                      aspectRatio={1}
                      dominantColor={null}
                      blurhash={null}
                      className="h-full w-full"
                      loading="lazy"
                    />
                    {sel && (
                      <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-point-500 shadow">
                        <Check size={12} strokeWidth={3.5} className="text-white" />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
