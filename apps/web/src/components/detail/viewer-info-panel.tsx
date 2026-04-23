'use client'
import { cn } from '@/lib/cn'
import { X } from 'lucide-react'
import { useState } from 'react'
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
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('bebe.detail.panelOpen') !== '0'
  })

  function toggle() {
    const next = !open
    setOpen(next)
    localStorage.setItem('bebe.detail.panelOpen', next ? '1' : '0')
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={toggle}
        className="fixed right-4 top-20 z-40 rounded-full bg-base-0 px-3 py-2 text-sm shadow-lg dark:bg-base-900"
      >
        세부정보
      </button>
    )
  }

  return (
    <aside
      className={cn(
        'fixed right-0 top-0 z-40 h-screen w-[360px] overflow-y-auto border-l bg-base-0 dark:bg-base-950',
        'flex flex-col',
      )}
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">세부정보</h2>
        <button
          type="button"
          onClick={toggle}
          aria-label="패널 닫기"
          className="text-base-500 hover:text-base-900 dark:hover:text-base-100"
        >
          <X size={18} />
        </button>
      </div>
      <div className="space-y-6 p-4">
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
    </aside>
  )
}
