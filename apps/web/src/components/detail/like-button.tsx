'use client'
import { cn } from '@/lib/cn'
import { useFeature } from '@/lib/features'
import { useToast } from '@/lib/toast'
import { motion } from 'framer-motion'
import { Heart } from 'lucide-react'
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
        title: '좋아요를 반영하지 못했어요',
        variant: 'danger',
        action: { label: '다시 시도', onClick },
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
      aria-label={liked ? '좋아요 취소' : '좋아요'}
      className={cn(
        'focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition active:scale-90',
        'hover:bg-base-100 dark:hover:bg-base-800',
        pending && 'opacity-70',
      )}
    >
      <motion.span
        animate={{ scale: liked ? [1, 1.35, 1] : 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 18 }}
        className="inline-flex"
      >
        <Heart
          size={iconSize}
          className={cn(
            'transition-colors',
            liked ? 'fill-point-500 text-point-500' : 'text-base-500',
          )}
        />
      </motion.span>
      {count > 0 && <span className="text-sm tabular-nums">{count}</span>}
    </button>
  )
}
