'use client'
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
  initialLiked,
  initialBookmarked,
  initialComments,
}: {
  assetId: string
  currentUserId: string
  canDeleteAny: boolean
  familyMembers: Member[]
  meta: MetaProps
  likers: { count: number; users: User[] }
  initialLiked: boolean
  initialBookmarked: boolean
  initialComments: CommentWithAuthor[]
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-base-800 bg-base-950/95 px-4 py-3 backdrop-blur">
        <h2 className="text-sm font-semibold text-base-100">세부정보</h2>
      </div>
      <div className="space-y-6 p-4">
        <MetadataSection {...meta} />
        <div className="space-y-2 border-t border-base-800 pt-4">
          <div className="flex items-center gap-2">
            <LikeButton assetId={assetId} initialLiked={initialLiked} initialCount={likers.count} />
            <BookmarkButton assetId={assetId} initialBookmarked={initialBookmarked} />
          </div>
          <LikerAvatars users={likers.users} />
        </div>
        <div className="border-t border-base-800 pt-4">
          <h3 className="mb-2 text-sm font-semibold text-base-100">
            댓글 {initialComments.filter((c) => !c.deletedAt).length}
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
