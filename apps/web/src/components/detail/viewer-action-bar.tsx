'use client'
import { assetDownloadHref } from '@/lib/asset-download'
import { cn } from '@/lib/cn'
import { useFeatures } from '@/lib/features'
import { useToast } from '@/lib/toast'
import { Download, FolderPlus, MessageCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { BookmarkButton } from './bookmark-button'
import { LikeButton } from './like-button'
import { ViewerShareButton } from './viewer-share-button'

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
  canAlbum,
  shareStoryId,
  onCommentTap,
  onAlbumTap,
}: {
  assetId: string
  /** 이 사진이 속한, 공유할 수 있는 스토리 — 있으면 공유 시트에서 스토리도 고를 수 있다. */
  shareStoryId: string | null
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
  const toast = useToast()
  const t = useTranslations('viewer')
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 flex items-center justify-around bg-gradient-to-t from-black/70 to-transparent px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-8 transition-opacity',
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none',
      )}
    >
      <LikeButton
        assetId={assetId}
        controlled={{ liked, setLiked, count, setCount }}
        className="text-white hover:bg-white/10 dark:hover:bg-white/10"
      />
      {features.comments && (
        <button
          type="button"
          onClick={onCommentTap}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-white"
        >
          <MessageCircle size={22} aria-hidden />
          {/* aria-label 로 덮으면 보이는 댓글 수가 안 읽힌다 — 이름은 '댓글 3'. */}
          <span className="sr-only">{t('actions.comments')}</span>
          {commentCount > 0 && <span className="text-sm tabular-nums">{commentCount}</span>}
        </button>
      )}
      {features.albums && canAlbum ? (
        <button
          type="button"
          onClick={onAlbumTap}
          aria-label={t('actions.addToAlbum')}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-white transition-transform ease-ios active:scale-[0.96]"
        >
          <FolderPlus size={22} />
        </button>
      ) : (
        <a
          href={assetDownloadHref(assetId, 'auto')}
          download
          aria-label={t('actions.download')}
          onClick={() => toast({ title: t('actions.savingPhoto') })}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-white transition-transform ease-ios active:scale-[0.96]"
        >
          <Download size={22} />
        </a>
      )}
      {features.share && (
        <ViewerShareButton
          assetId={assetId}
          storyId={shareStoryId}
          iconSize={22}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-white transition-transform ease-ios active:scale-[0.96]"
        />
      )}
      <BookmarkButton
        assetId={assetId}
        controlled={{ bookmarked, setBookmarked }}
        className="text-white hover:bg-white/10 dark:hover:bg-white/10"
      />
    </div>
  )
}
