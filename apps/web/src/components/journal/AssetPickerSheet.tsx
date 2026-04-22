'use client'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import type { Asset } from '@bebe/db'
import { useState } from 'react'

function thumbKeyOf(a: Asset): string | undefined {
  const d = (a.derivatives ?? {}) as Record<string, string>
  return d.thumb_sm ?? d.poster
}

export function AssetPickerSheet({
  available,
  initialSelected = [],
  onChange,
  triggerLabel,
  max = 10,
}: {
  available: Asset[]
  initialSelected?: string[]
  onChange: (ids: string[]) => void
  triggerLabel: string
  max?: number
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected))

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else if (next.size < max) next.add(id)
    setSelected(next)
  }

  function confirm() {
    onChange(Array.from(selected))
    setOpen(false)
  }

  return (
    <>
      <Button type="button" variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title={`사진 선택 (${selected.size}/${max})`}>
        <div className="grid grid-cols-3 gap-1">
          {available.map((a) => {
            const isSel = selected.has(a.id)
            const tk = thumbKeyOf(a)
            return (
              <button
                type="button"
                key={a.id}
                onClick={() => toggle(a.id)}
                className={`relative aspect-square overflow-hidden rounded-lg border ${isSel ? 'ring-2 ring-point-500' : ''}`}
              >
                {tk ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/media/${tk}`} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-base-500">
                    처리 중
                  </div>
                )}
                {isSel && (
                  <div className="absolute right-1 top-1 rounded-full bg-point-500 px-1.5 text-xs text-white">
                    ✓
                  </div>
                )}
              </button>
            )
          })}
        </div>
        <div className="sticky bottom-0 mt-4 border-t bg-base-0 pt-4">
          <Button onClick={confirm} className="w-full">
            확인
          </Button>
        </div>
      </Sheet>
    </>
  )
}
