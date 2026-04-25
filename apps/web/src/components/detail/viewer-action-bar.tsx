'use client'
import { cn } from '@/lib/cn'
import { MessageCircle } from 'lucide-react'
import { BookmarkButton } from './bookmark-button'
import { LikeButton } from './like-button'

export function ViewerActionBar({
  assetId,
  liked,
  setLiked,
  count,
  setCount,
  bookmarked,
  setBookmarked,
  commentCount,
  visible,
  onCommentTap,
}: {
  assetId: string
  liked: boolean
  setLiked: (next: boolean) => void
  count: number
  setCount: (next: number) => void
  bookmarked: boolean
  setBookmarked: (next: boolean) => void
  commentCount: number
  visible: boolean
  onCommentTap: () => void
}) {
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 flex items-center justify-around bg-gradient-to-t from-black/70 to-transparent px-4 pb-6 pt-8 transition-opacity',
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none',
      )}
    >
      <LikeButton assetId={assetId} controlled={{ liked, setLiked, count, setCount }} />
      <button
        type="button"
        onClick={onCommentTap}
        aria-label="댓글"
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-white"
      >
        <MessageCircle size={22} />
        {commentCount > 0 && <span className="text-sm tabular-nums">{commentCount}</span>}
      </button>
      <BookmarkButton assetId={assetId} controlled={{ bookmarked, setBookmarked }} />
    </div>
  )
}
