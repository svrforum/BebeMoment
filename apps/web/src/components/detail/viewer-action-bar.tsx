'use client'
import { cn } from '@/lib/cn'
import { useFeatures } from '@/lib/features'
import { Download, FolderPlus, MessageCircle } from 'lucide-react'
import { BookmarkButton } from './bookmark-button'
import { LikeButton } from './like-button'
import { ShareLinkButton } from './share-link-button'

export function ViewerActionBar({
  assetId,
  publicNo,
  liked,
  setLiked,
  count,
  setCount,
  bookmarked,
  setBookmarked,
  commentCount,
  visible,
  canAlbum,
  onCommentTap,
  onAlbumTap,
}: {
  assetId: string
  publicNo: number
  liked: boolean
  setLiked: (next: boolean) => void
  count: number
  setCount: (next: number) => void
  bookmarked: boolean
  setBookmarked: (next: boolean) => void
  commentCount: number
  visible: boolean
  canAlbum: boolean
  onCommentTap: () => void
  onAlbumTap: () => void
}) {
  const features = useFeatures()
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 flex items-center justify-around bg-gradient-to-t from-black/70 to-transparent px-4 pb-6 pt-8 transition-opacity',
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none',
      )}
    >
      <LikeButton assetId={assetId} controlled={{ liked, setLiked, count, setCount }} />
      {features.comments && (
        <button
          type="button"
          onClick={onCommentTap}
          aria-label="댓글"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-white"
        >
          <MessageCircle size={22} />
          {commentCount > 0 && <span className="text-sm tabular-nums">{commentCount}</span>}
        </button>
      )}
      {features.albums && canAlbum ? (
        <button
          type="button"
          onClick={onAlbumTap}
          aria-label="앨범에 추가"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-white transition-transform ease-ios active:scale-90"
        >
          <FolderPlus size={22} />
        </button>
      ) : (
        <a
          href={`/api/asset/${assetId}/download?q=original`}
          download
          aria-label="원본 다운로드"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-white transition-transform ease-ios active:scale-90"
        >
          <Download size={22} />
        </a>
      )}
      <ShareLinkButton
        path={`/detail/${publicNo}`}
        iconSize={22}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-white transition-transform ease-ios active:scale-90"
      />
      <BookmarkButton assetId={assetId} controlled={{ bookmarked, setBookmarked }} />
    </div>
  )
}
