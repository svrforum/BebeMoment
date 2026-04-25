'use client'
import type { AssetUrls } from '@bebe/media-client'
import { useState } from 'react'
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
  urls: AssetUrls | null
  videoSrc: string | null
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
  // Chrome toggle is mobile-only; desktop always shows top bar + side panel via CSS.
  const [chromeVisible, setChromeVisible] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(likers.count)
  const [bookmarked, setBookmarked] = useState(initialBookmarked)

  return (
    <div className="relative min-h-screen bg-black md:flex">
      {/* Image column: takes full width on mobile, flexes on desktop */}
      <div className="relative flex-1 min-w-0">
        <ViewerTopBar assetId={current.id} visible={chromeVisible} />
        <ViewerImage
          current={current}
          siblings={siblings}
          onToggleChrome={() => setChromeVisible((v) => !v)}
        />
      </div>

      {/* Mobile-only action bar + bottom sheet */}
      <div className="md:hidden">
        <ViewerActionBar
          assetId={current.id}
          liked={liked}
          setLiked={setLiked}
          count={count}
          setCount={setCount}
          bookmarked={bookmarked}
          setBookmarked={setBookmarked}
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
          liked={liked}
          setLiked={setLiked}
          count={count}
          setCount={setCount}
          bookmarked={bookmarked}
          setBookmarked={setBookmarked}
          initialComments={initialComments}
        />
      </div>

      {/* Desktop-only info panel: always visible */}
      <aside className="hidden w-[360px] shrink-0 overflow-y-auto border-l border-base-200 bg-base-0 md:block dark:border-base-800 dark:bg-base-900">
        <ViewerInfoPanel
          assetId={current.id}
          currentUserId={currentUserId}
          canDeleteAny={canDeleteAny}
          familyMembers={familyMembers}
          meta={meta}
          likers={likers}
          liked={liked}
          setLiked={setLiked}
          count={count}
          setCount={setCount}
          bookmarked={bookmarked}
          setBookmarked={setBookmarked}
          initialComments={initialComments}
        />
      </aside>
    </div>
  )
}
