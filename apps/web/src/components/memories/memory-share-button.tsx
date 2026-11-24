'use client'
import { ShareSheet } from '@/components/detail/share-sheet'
import { useFeatures } from '@/lib/features'
import { Share2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

/**
 * 추억 묶음("1년 전 오늘") 공유 — 지금 이 묶음에 보이는 사진으로 **고정된** 링크를 만든다.
 * '이 날 공유'는 대표 사진과 글만 보여 주고 나중에 올린 사진도 따라 들어가지만, 추억은
 * "이 사진들 좀 봐"라서 받은 사람이 사진을 다 본다. 그래서 날짜가 아니라 사진 목록으로 낸다 —
 * 아무도 고르지 않은 사진이 뒤늦게 공개되지 않게.
 */
export function MemoryShareButton({ assetIds, label }: { assetIds: string[]; label: string }) {
  const features = useFeatures()
  const [open, setOpen] = useState(false)
  const t = useTranslations('social')
  const target = useMemo(() => ({ kind: 'selection' as const, assetIds }), [assetIds])
  if (!features.share || assetIds.length === 0) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('share.shareMemory', { label })}
        className="-my-1.5 -mr-1.5 ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base-500 transition hover:bg-base-100 hover:text-base-700 active:scale-[0.96] dark:hover:bg-base-800 dark:hover:text-base-300"
      >
        <Share2 size={15} />
      </button>
      <ShareSheet
        target={target}
        title={t('share.text.memory', { interval: label })}
        copy="memory"
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
