'use client'
import { type AssetTag, TagEditor } from '@/components/tags/tag-editor'
import { BookmarkButton } from './bookmark-button'
import type { CommentWithAuthor } from './comment-item'
import { CommentList } from './comment-list'
import { LikeButton } from './like-button'
import { LikerAvatars } from './liker-avatars'
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
  initialComments,
  initialTags,
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
  initialComments: CommentWithAuthor[]
  initialTags: AssetTag[]
}) {
  const liveCommentCount = initialComments.filter((c) => !c.deletedAt).length
  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-base-200/70 bg-base-0/85 px-5 py-3.5 backdrop-blur-xl dark:border-base-800/70 dark:bg-base-900/85">
        <h2 className="text-[15px] font-semibold tracking-tight text-base-900 dark:text-base-50">
          세부정보
        </h2>
      </div>
      <div className="flex flex-col gap-5 px-5 py-5">
        <MetadataSection {...meta} />
        <TagEditor assetId={assetId} initial={initialTags} />
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-1">
            <LikeButton assetId={assetId} controlled={{ liked, setLiked, count, setCount }} />
            <BookmarkButton assetId={assetId} controlled={{ bookmarked, setBookmarked }} />
          </div>
          <LikerAvatars users={likers.users} />
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-[13px] font-semibold tracking-tight text-base-500">
            댓글 <span className="tabular-nums text-base-700 dark:text-base-300">{liveCommentCount}</span>
          </h3>
          <CommentList
            assetId={assetId}
            currentUserId={currentUserId}
            canDeleteAny={canDeleteAny}
            familyMembers={familyMembers}
            initialComments={initialComments}
          />
        </div>
      </div>
    </div>
  )
}
