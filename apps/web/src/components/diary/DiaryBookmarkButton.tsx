'use client'
import { cn } from '@/lib/cn'
import { useFeature } from '@/lib/features'
import { useToast } from '@/lib/toast'
import { Bookmark } from 'lucide-react'
import { useState } from 'react'

type Props = {
  entryId: string
  initialBookmarked: boolean
}

export function DiaryBookmarkButton({ entryId, initialBookmarked }: Props) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked)
  const [pending, setPending] = useState(false)
  const toast = useToast()
  const bookmarksOn = useFeature('bookmarks')

  if (!bookmarksOn) return null

  async function onClick() {
    if (pending) return
    const prev = bookmarked
    setPending(true)
    setBookmarked(!prev)
    try {
      const res = await fetch(`/api/diary/${entryId}/bookmark`, { method: 'POST' })
      if (!res.ok) throw new Error('failed')
      const data = (await res.json()) as { bookmarked: boolean }
      setBookmarked(data.bookmarked)
    } catch {
      setBookmarked(prev)
      toast({ title: '잠시 후 다시 시도해주세요', variant: 'danger' })
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={bookmarked}
      aria-label={bookmarked ? '저장 취소' : '저장함에 추가'}
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium transition-colors active:scale-95',
        bookmarked
          ? 'text-point-600 hover:bg-point-500/10 dark:text-point-400'
          : 'text-base-500 hover:bg-base-100 hover:text-base-800 dark:text-base-400 dark:hover:bg-base-800 dark:hover:text-base-100',
        pending && 'opacity-70',
      )}
    >
      <Bookmark
        size={13}
        strokeWidth={2.2}
        className={cn('transition', bookmarked && 'fill-point-500 text-point-500')}
      />
      <span>{bookmarked ? '저장됨' : '저장'}</span>
    </button>
  )
}
