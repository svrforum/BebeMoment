'use client'
import { type AssetTag, TagEditor } from '@/components/tags/tag-editor'
import { Sheet } from '@/components/ui/sheet'
import { ChevronDown } from 'lucide-react'
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
  commentCount,
  onCommentCountChange,
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
  commentCount: number
  onCommentCountChange: (count: number) => void
  initialComments: CommentWithAuthor[]
  initialTags: AssetTag[]
  initialFilename: string
  initialCaption: string | null
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={`댓글 ${commentCount}`}>
      <div className="flex min-h-0 flex-col">
        {/* 좋아요/북마크 + 좋아요한 사람: 상단 컴팩트 행 */}
        <div className="flex flex-col gap-2 border-b border-base-100 pb-3 dark:border-base-800">
          <div className="flex items-center gap-2">
            <LikeButton assetId={assetId} controlled={{ liked, setLiked, count, setCount }} />
            <BookmarkButton assetId={assetId} controlled={{ bookmarked, setBookmarked }} />
          </div>
          <LikerAvatars users={likers.users} />
        </div>

        {/* 세부정보: 한 번 탭으로 펼치는 접이식 영역 (메타데이터·태그) */}
        <details className="group border-b border-base-100 py-1 dark:border-base-800">
          <summary className="flex cursor-pointer list-none items-center justify-between py-2 text-sm font-medium text-base-700 dark:text-base-300">
            세부정보
            <ChevronDown
              size={16}
              className="text-base-400 transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="space-y-6 pb-3 pt-1">
            <MetadataEditor
              assetId={assetId}
              initialFilename={initialFilename}
              initialCaption={initialCaption}
              initialTakenAtISO={meta.takenAt.toISOString()}
              initialTakenAtSource={meta.takenAtSource}
            />
            <MetadataSection {...meta} />
            <TagEditor assetId={assetId} initial={initialTags} />
          </div>
        </details>

        {/* 댓글: 시트의 주 콘텐츠 + 작성칸 하단 고정 */}
        <div className="pt-3">
          <CommentList
            assetId={assetId}
            currentUserId={currentUserId}
            canDeleteAny={canDeleteAny}
            familyMembers={familyMembers}
            initialComments={initialComments}
            onCountChange={onCommentCountChange}
            stickyComposer
          />
        </div>
      </div>
    </Sheet>
  )
}
