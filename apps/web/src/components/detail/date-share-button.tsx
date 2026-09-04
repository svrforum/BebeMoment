'use client'
import { useFeatures } from '@/lib/features'
import { Share2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { ShareSheet } from './share-sheet'

// "이 날 공유" — 그 날(date=YYYY-MM-DD)의 사진과 이야기를 한 링크로. 타임라인 날짜 헤더(sm)와
// 날짜 필터 화면 상단 헤더 두 곳. 링크는 해석 시점 기준이라 그 날 사진이 늘면 링크에도 반영.
// share 기능 꺼지면 숨김.
export function DateShareButton({ date, size = 'md' }: { date: string; size?: 'sm' | 'md' }) {
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
        className={
          size === 'sm'
            ? '-my-1.5 -mr-1.5 flex h-8 w-8 items-center justify-center rounded-full text-base-400 transition hover:bg-base-100 hover:text-base-600 active:scale-95 dark:hover:bg-base-800 dark:hover:text-base-300'
            : 'flex h-9 w-9 items-center justify-center rounded-full text-base-600 transition hover:bg-base-100 active:scale-95 dark:text-base-300 dark:hover:bg-base-800'
        }
      >
        <Share2 size={size === 'sm' ? 15 : 18} />
      </button>
      <ShareSheet target={{ kind: 'date', date }} open={open} onOpenChange={setOpen} />
    </>
  )
}
