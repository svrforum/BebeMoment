'use client'
import { cn } from '@/lib/cn'
import { useFeature } from '@/lib/features'
import { useToast } from '@/lib/toast'
import { Bookmark } from 'lucide-react'
import { useState } from 'react'

type Controlled = {
  bookmarked: boolean
  setBookmarked: (next: boolean) => void
}

type Props = {
  assetId: string
  size?: 'sm' | 'md'
} & (
  | { initialBookmarked: boolean; controlled?: undefined }
  | { initialBookmarked?: undefined; controlled: Controlled }
)

export function BookmarkButton(props: Props) {
  const { assetId, size = 'md' } = props
  const [internalBookmarked, setInternalBookmarked] = useState(props.initialBookmarked ?? false)
  const [pending, setPending] = useState(false)
  const toast = useToast()
  const bookmarksOn = useFeature('bookmarks')

  const bookmarked = props.controlled ? props.controlled.bookmarked : internalBookmarked
  const setBookmarked = props.controlled ? props.controlled.setBookmarked : setInternalBookmarked

  if (!bookmarksOn) return null

  async function onClick() {
    if (pending) return
    const prev = bookmarked
    setPending(true)
    setBookmarked(!prev)
    try {
      const res = await fetch(`/api/asset/${assetId}/bookmark`, { method: 'POST' })
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

  const iconSize = size === 'sm' ? 18 : 22

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={bookmarked}
      aria-label={bookmarked ? '저장 취소' : '저장함에 추가'}
      className={cn(
        'focus-ring inline-flex items-center rounded-full px-3 py-1.5 transition active:scale-90',
        'hover:bg-base-100 dark:hover:bg-base-800',
        pending && 'opacity-70',
      )}
    >
      <Bookmark
        size={iconSize}
        className={cn('transition', bookmarked ? 'fill-point-500 text-point-500' : 'text-base-500')}
      />
    </button>
  )
}
