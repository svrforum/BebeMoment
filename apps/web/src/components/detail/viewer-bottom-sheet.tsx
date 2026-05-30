'use client'
import { Sheet } from '@/components/ui/sheet'
import { useFeatures } from '@/lib/features'
import { ChevronDown } from 'lucide-react'
import { useEffect, useState } from 'react'
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
  initialFilename,
  initialCaption,
  initialDetailsOpen,
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
  initialFilename: string
  initialCaption: string | null
  /** ⋮ "정보"로 열면 세부정보 펼친 채로, 댓글로 열면 접힌 채로. */
  initialDetailsOpen?: boolean
}) {
  const features = useFeatures()
  // 시트가 열릴 때마다 진입 의도(정보 vs 댓글)에 맞춰 세부정보 펼침 상태 초기화.
  const [detailsOpen, setDetailsOpen] = useState(false)
  useEffect(() => {
    if (open) setDetailsOpen(initialDetailsOpen ?? false)
  }, [open, initialDetailsOpen])

  // 좋아요/북마크 + 세부정보(접이식) 는 댓글 리스트와 같은 스크롤 영역의 헤더로,
  // 작성칸은 시트 하단에 고정 (인스타 스타일). 고정 높이 flex 컬럼은 Sheet `fill`.
  const header = (
    <div className="pb-2">
      <div className="flex flex-col gap-2 border-b border-base-100 pb-3 dark:border-base-800">
        <div className="flex items-center gap-2">
          <LikeButton assetId={assetId} controlled={{ liked, setLiked, count, setCount }} />
          <BookmarkButton assetId={assetId} controlled={{ bookmarked, setBookmarked }} />
        </div>
        <LikerAvatars users={likers.users} />
      </div>

      <details
        open={detailsOpen}
        onToggle={(e) => setDetailsOpen((e.currentTarget as HTMLDetailsElement).open)}
        className="group border-b border-base-100 py-1 dark:border-base-800"
      >
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
        </div>
      </details>
    </div>
  )

  // 댓글 기능이 꺼져 있으면 댓글 리스트·작성칸을 숨기고 시트는 '사진 정보'로만 쓴다
  // (⋮ 정보로 진입). 켜져 있으면 기존처럼 댓글 + 헤더.
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={features.comments ? `댓글 ${commentCount}` : '사진 정보'}
      fill
    >
      {features.comments ? (
        <CommentList
          assetId={assetId}
          currentUserId={currentUserId}
          canDeleteAny={canDeleteAny}
          familyMembers={familyMembers}
          initialComments={initialComments}
          onCountChange={onCommentCountChange}
          fill
          header={header}
        />
      ) : (
        <div className="overflow-y-auto px-0.5">{header}</div>
      )}
    </Sheet>
  )
}
