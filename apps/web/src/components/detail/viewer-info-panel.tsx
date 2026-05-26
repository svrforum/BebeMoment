'use client'
import { type AssetTag, TagEditor } from '@/components/tags/tag-editor'
import { FolderPlus } from 'lucide-react'
import { BookmarkButton } from './bookmark-button'
import type { CommentWithAuthor } from './comment-item'
import { CommentList } from './comment-list'
import { LikeButton } from './like-button'
import { LikerAvatars } from './liker-avatars'
import { MetadataEditor } from './metadata-editor'
import { MetadataSection } from './metadata-section'

type Member = { id: string; displayName: string }
type User = { id: string; displayName: string; avatarPath: string | null }

type MetaProps = React.ComponentProps<typeof MetadataSection>

export function ViewerInfoPanel({
  assetId,
  currentUserId,
  canDeleteAny,
  familyMembers,
  meta,
  likers,
  liked,
  setLiked,
  count,
  setCount,
  bookmarked,
  setBookmarked,
  commentCount,
  onCommentCountChange,
  initialComments,
  initialTags,
  initialFilename,
  initialCaption,
  onAlbumTap,
}: {
  assetId: string
  currentUserId: string
  canDeleteAny: boolean
  familyMembers: Member[]
  meta: MetaProps
  likers: { count: number; users: User[] }
  liked: boolean
  setLiked: (next: boolean) => void
  count: number
  setCount: (next: number) => void
  bookmarked: boolean
  setBookmarked: (next: boolean) => void
  commentCount: number
  onCommentCountChange: (count: number) => void
  initialComments: CommentWithAuthor[]
  initialTags: AssetTag[]
  initialFilename: string
  initialCaption: string | null
  onAlbumTap: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-base-200/70 bg-base-0/85 px-5 py-3.5 backdrop-blur-xl dark:border-base-800/70 dark:bg-base-900/85">
        <h2 className="text-[15px] font-semibold tracking-tight text-base-900 dark:text-base-50">
          세부정보
        </h2>
      </div>
      <div className="flex flex-col gap-5 px-5 py-5">
        <MetadataEditor
          assetId={assetId}
          initialFilename={initialFilename}
          initialCaption={initialCaption}
          initialTakenAtISO={meta.takenAt.toISOString()}
          initialTakenAtSource={meta.takenAtSource}
        />
        <MetadataSection {...meta} />
        <TagEditor assetId={assetId} initial={initialTags} />
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-1">
            <LikeButton assetId={assetId} controlled={{ liked, setLiked, count, setCount }} />
            <BookmarkButton assetId={assetId} controlled={{ bookmarked, setBookmarked }} />
            <button
              type="button"
              onClick={onAlbumTap}
              aria-label="앨범에 추가"
              className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-base-500 transition-colors hover:bg-base-100 hover:text-base-900 dark:hover:bg-base-800 dark:hover:text-base-100"
            >
              <FolderPlus size={18} strokeWidth={2} />
            </button>
          </div>
          <LikerAvatars users={likers.users} />
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-[13px] font-semibold tracking-tight text-base-500">
            댓글{' '}
            <span className="tabular-nums text-base-700 dark:text-base-300">{commentCount}</span>
          </h3>
          <CommentList
            assetId={assetId}
            currentUserId={currentUserId}
            canDeleteAny={canDeleteAny}
            familyMembers={familyMembers}
            initialComments={initialComments}
            onCountChange={onCommentCountChange}
          />
        </div>
      </div>
    </div>
  )
}
