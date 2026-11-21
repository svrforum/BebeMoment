'use client'
import { cn } from '@/lib/cn'
import { useFeature } from '@/lib/features'
import { useToast } from '@/lib/toast'
import { Bookmark } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

type Controlled = {
  bookmarked: boolean
  setBookmarked: (next: boolean) => void
}

type Props = {
  assetId: string
  size?: 'sm' | 'md'
  /** 검은 뷰어 위처럼 페이지 테마와 무관한 표면에 놓일 때 색을 덮어쓴다(예: 'text-white'). */
  className?: string
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
  const t = useTranslations('social')

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
      toast({
        title: t('bookmark.failed'),
        variant: 'danger',
        action: { label: t('bookmark.retry'), onClick },
      })
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
      aria-label={t('bookmark.label')}
      className={cn(
        'focus-ring inline-flex items-center rounded-full px-3 py-1.5 text-base-500 transition active:scale-[0.96]',
        'hover:bg-base-100 dark:hover:bg-base-800',
        pending && 'opacity-70',
        props.className,
      )}
    >
      <Bookmark
        size={iconSize}
        aria-hidden
        className={cn('transition', bookmarked && 'fill-point-500 text-point-500')}
      />
    </button>
  )
}
