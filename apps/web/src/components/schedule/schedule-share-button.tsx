'use client'
import { ShareSheet } from '@/components/detail/share-sheet'
import { Share2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

/** 일정 상세 헤더의 공유 — 링크를 연 사람은 로그인 전엔 제목·날짜·시각만 본다. */
export function ScheduleShareButton({ entryId, title }: { entryId: string; title: string }) {
  const [open, setOpen] = useState(false)
  const t = useTranslations('social')
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring flex min-h-11 items-center gap-1 rounded-lg px-1 text-[15px] font-medium text-point-500 transition active:opacity-70"
      >
        <Share2 size={16} strokeWidth={2.2} aria-hidden />
        {t('share.share')}
      </button>
      <ShareSheet
        target={{ kind: 'schedule', entryId }}
        title={title}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
