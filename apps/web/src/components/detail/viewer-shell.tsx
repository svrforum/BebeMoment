'use client'
import { useEffect, useState } from 'react'
import type { CommentWithAuthor } from './comment-item'
import type { MetadataSection } from './metadata-section'
import { ViewerActionBar } from './viewer-action-bar'
import { ViewerBottomSheet } from './viewer-bottom-sheet'
import { ViewerImage } from './viewer-image'
import { ViewerInfoPanel } from './viewer-info-panel'
import { ViewerTopBar } from './viewer-top-bar'

type Member = { id: string; displayName: string }
type User = { id: string; displayName: string; avatarPath: string | null }
type MetaProps = React.ComponentProps<typeof MetadataSection>
type AssetSlim = {
  id: string
  kind: 'image' | 'video'
  mediaUrl: string
  posterUrl: string | undefined
}

export function ViewerShell({
  current,
  siblings,
  currentUserId,
  canDeleteAny,
  familyMembers,
  meta,
  likers,
  initialLiked,
  initialBookmarked,
  initialComments,
}: {
  current: AssetSlim
  siblings: { prevId: string | undefined; nextId: string | undefined }
  currentUserId: string
  canDeleteAny: boolean
  familyMembers: Member[]
  meta: MetaProps
  likers: { count: number; users: User[] }
  initialLiked: boolean
  initialBookmarked: boolean
  initialComments: CommentWithAuthor[]
}) {
  const [isDesktop, setIsDesktop] = useState(false)
  const [chromeVisible, setChromeVisible] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)')
    setIsDesktop(mql.matches)
    const listener = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mql.addEventListener('change', listener)
    return () => mql.removeEventListener('change', listener)
  }, [])

  if (isDesktop) {
    return (
      <div className="relative min-h-screen bg-black">
        <ViewerTopBar assetId={current.id} visible={true} />
        <ViewerImage current={current} siblings={siblings} />
        <ViewerInfoPanel
          assetId={current.id}
          currentUserId={currentUserId}
          canDeleteAny={canDeleteAny}
          familyMembers={familyMembers}
          meta={meta}
          likers={likers}
          initialLiked={initialLiked}
          initialBookmarked={initialBookmarked}
          initialComments={initialComments}
        />
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-black">
      <ViewerTopBar assetId={current.id} visible={chromeVisible} />
      <ViewerImage
        current={current}
        siblings={siblings}
        onToggleChrome={() => setChromeVisible((v) => !v)}
      />
      <ViewerActionBar
        assetId={current.id}
        likeState={{ liked: initialLiked, count: likers.count }}
        bookmarkState={{ bookmarked: initialBookmarked }}
        commentCount={initialComments.filter((c) => !c.deletedAt).length}
        visible={chromeVisible}
        onCommentTap={() => setSheetOpen(true)}
      />
      <ViewerBottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        assetId={current.id}
        currentUserId={currentUserId}
        canDeleteAny={canDeleteAny}
        familyMembers={familyMembers}
        meta={meta}
        likers={likers}
        initialLiked={initialLiked}
        initialBookmarked={initialBookmarked}
        initialComments={initialComments}
      />
    </div>
  )
}
