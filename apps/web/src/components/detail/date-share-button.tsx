'use client'
import { useFeatures } from '@/lib/features'
import { Share2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { ShareSheet } from './share-sheet'

// 날짜 필터 타임라인 헤더의 "이 날 공유" — 그 날(date=YYYY-MM-DD)의 사진을 한 링크로.
// 동적: 그 날 사진이 늘면 링크에도 반영. share 기능 꺼지면 숨김.
export function DateShareButton({ date }: { date: string }) {
  const features = useFeatures()
  const [open, setOpen] = useState(false)
  const t = useTranslations('social')
  if (!features.share) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('share.shareThisDay')}
        className="flex h-9 w-9 items-center justify-center rounded-full text-base-600 transition hover:bg-base-100 active:scale-95 dark:text-base-300 dark:hover:bg-base-800"
      >
        <Share2 size={18} />
      </button>
      <ShareSheet target={{ kind: 'date', date }} open={open} onOpenChange={setOpen} />
    </>
  )
}
