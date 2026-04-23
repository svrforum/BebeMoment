'use client'
import { cn } from '@/lib/cn'
import { Heart } from 'lucide-react'
import { useState } from 'react'

export function LikeButton({
  assetId,
  initialLiked,
  initialCount,
  size = 'md',
}: {
  assetId: string
  initialLiked: boolean
  initialCount: number
  size?: 'sm' | 'md'
}) {
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [pending, setPending] = useState(false)

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
      aria-label={liked ? '좋아요 취소' : '좋아요'}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition',
        'hover:bg-base-100 dark:hover:bg-base-800',
        pending && 'opacity-70',
      )}
    >
      <Heart
        size={iconSize}
        className={cn('transition', liked ? 'fill-point-500 text-point-500' : 'text-base-500')}
      />
      {count > 0 && <span className="text-sm tabular-nums">{count}</span>}
    </button>
  )
}
