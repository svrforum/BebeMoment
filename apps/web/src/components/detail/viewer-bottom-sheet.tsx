'use client'
import { Sheet } from '@/components/ui/sheet'
import { BookmarkButton } from './bookmark-button'
import type { CommentWithAuthor } from './comment-item'
import { CommentList } from './comment-list'
import { LikeButton } from './like-button'
import { LikerAvatars } from './liker-avatars'
import { MetadataSection } from './metadata-section'

type Member = { id: string; displayName: string }
type User = { id: string; displayName: string; avatarPath: string | null }

type MetaProps = React.ComponentProps<typeof MetadataSection>

export function ViewerBottomSheet({
  open,
  onOpenChange,
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
  open: boolean
  onOpenChange: (next: boolean) => void
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
    <Sheet open={open} onOpenChange={onOpenChange} title="세부정보">
      <div className="space-y-6 pb-8">
        <MetadataSection {...meta} />
        <div className="space-y-2 border-t pt-4">
          <div className="flex items-center gap-2">
            <LikeButton assetId={assetId} initialLiked={initialLiked} initialCount={likers.count} />
            <BookmarkButton assetId={assetId} initialBookmarked={initialBookmarked} />
          </div>
          <LikerAvatars users={likers.users} />
        </div>
        <div className="border-t pt-4">
          <h3 className="mb-2 text-sm font-semibold">
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
    </Sheet>
  )
}
