'use client'
import { cn } from '@/lib/cn'
import { useFeature } from '@/lib/features'
import { useToast } from '@/lib/toast'
import { Heart } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

type Controlled = {
  liked: boolean
  setLiked: (next: boolean) => void
  count: number
  setCount: (next: number) => void
}

type Props = {
  assetId: string
  size?: 'sm' | 'md'
  /** 검은 뷰어 위처럼 페이지 테마와 무관한 표면에 놓일 때 색을 덮어쓴다(예: 'text-white'). */
  className?: string
} & (
  | { initialLiked: boolean; initialCount: number; controlled?: undefined }
  | { initialLiked?: undefined; initialCount?: undefined; controlled: Controlled }
)

export function LikeButton(props: Props) {
  const { assetId, size = 'md' } = props
  const [internalLiked, setInternalLiked] = useState(props.initialLiked ?? false)
  const [internalCount, setInternalCount] = useState(props.initialCount ?? 0)
  const [pending, setPending] = useState(false)
  const toast = useToast()
  const likesOn = useFeature('likes')
  const t = useTranslations('social')

  const liked = props.controlled ? props.controlled.liked : internalLiked
  const count = props.controlled ? props.controlled.count : internalCount
  const setLiked = props.controlled ? props.controlled.setLiked : setInternalLiked
  const setCount = props.controlled ? props.controlled.setCount : setInternalCount

  if (!likesOn) return null

  async function onClick() {
    if (pending) return
    const prevLiked = liked
    const prevCount = count
    setPending(true)
    setLiked(!prevLiked)
    setCount(prevCount + (prevLiked ? -1 : 1))
    try {
      const res = await fetch(`/api/asset/${assetId}/like`, { method: 'POST' })
      if (!res.ok) throw new Error('failed')
      const data = (await res.json()) as { liked: boolean; count: number }
      setLiked(data.liked)
      setCount(data.count)
    } catch {
      setLiked(prevLiked)
      setCount(prevCount)
      toast({
        title: t('like.failed'),
        variant: 'danger',
        action: { label: t('like.retry'), onClick },
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
      aria-pressed={liked}
      className={cn(
        'focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-base-500 transition active:scale-[0.96]',
        'hover:bg-base-100 dark:hover:bg-base-800',
        pending && 'opacity-70',
        props.className,
      )}
    >
      <Heart
        size={iconSize}
        aria-hidden
        className={cn('transition-colors', liked && 'fill-point-500 text-point-500')}
      />
      {/* 이름은 '좋아요' 하나로 두고 상태는 aria-pressed 가 말한다 — 보이는 개수도 이름에 들어간다. */}
      <span className="sr-only">{t('like.like')}</span>
      {count > 0 && <span className="text-sm tabular-nums">{count}</span>}
    </button>
  )
}
