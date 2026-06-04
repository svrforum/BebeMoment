'use client'
import { useFeatures } from '@/lib/features'
import { Share2 } from 'lucide-react'
import { useState } from 'react'
import { ShareSheet } from './share-sheet'

// 타임라인 멀티셀렉트 바의 "공유" — 선택한 사진들을 한 링크로. share 기능 꺼지면 숨김.
export function SelectionShareButton({ assetIds }: { assetIds: string[] }) {
  const features = useFeatures()
  const [open, setOpen] = useState(false)
  if (!features.share) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="공유"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base-600 transition hover:bg-base-100 active:scale-95 dark:text-base-300 dark:hover:bg-base-800"
      >
        <Share2 size={18} strokeWidth={2} />
      </button>
      <ShareSheet target={{ kind: 'selection', assetIds }} open={open} onOpenChange={setOpen} />
    </>
  )
}
