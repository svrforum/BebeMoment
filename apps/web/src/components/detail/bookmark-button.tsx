'use client'
import { cn } from '@/lib/cn'
import { useToast } from '@/lib/toast'
import { Bookmark } from 'lucide-react'
import { useState } from 'react'

export function BookmarkButton({
  assetId,
  initialBookmarked,
  size = 'md',
}: {
  assetId: string
  initialBookmarked: boolean
  size?: 'sm' | 'md'
}) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked)
  const [pending, setPending] = useState(false)
  const toast = useToast()

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
        'inline-flex items-center rounded-full px-3 py-1.5 transition',
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
