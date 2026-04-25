'use client'
import { type AssetTag, TagEditor } from '@/components/tags/tag-editor'
import { Sheet } from '@/components/ui/sheet'
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

export function ViewerBottomSheet({
  open,
  onOpenChange,
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
  initialFilename,
  initialCaption,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
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
  initialFilename: string
  initialCaption: string | null
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="세부정보">
      <div className="space-y-6 pb-8">
        <MetadataEditor
          assetId={assetId}
          initialFilename={initialFilename}
          initialCaption={initialCaption}
          initialTakenAtISO={meta.takenAt.toISOString()}
          initialTakenAtSource={meta.takenAtSource}
        />
        <MetadataSection {...meta} />
        <TagEditor assetId={assetId} initial={initialTags} />
        <div className="space-y-2 border-t pt-4">
          <div className="flex items-center gap-2">
            <LikeButton assetId={assetId} controlled={{ liked, setLiked, count, setCount }} />
            <BookmarkButton assetId={assetId} controlled={{ bookmarked, setBookmarked }} />
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
