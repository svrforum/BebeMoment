'use client'
import { AlbumPicker } from '@/components/albums/album-picker'
import type { AssetTag } from '@/components/tags/tag-editor'
import { useToast } from '@/lib/toast'
import type { AssetUrls } from '@bebe/media-client'
import { useRouter } from 'next/navigation'
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
  urls: AssetUrls | null
  videoSrc: string | null
  posterUrl: string | undefined
}

export function ViewerShell({
  current,
  siblings,
  currentUserId,
  canDeleteAny,
  canDelete,
  familyMembers,
  meta,
  likers,
  initialLiked,
  initialBookmarked,
  initialComments,
  initialTags,
  initialFilename,
  initialCaption,
}: {
  current: AssetSlim
  siblings: { prevId: string | undefined; nextId: string | undefined }
  currentUserId: string
  canDeleteAny: boolean
  canDelete: boolean
  familyMembers: Member[]
  meta: MetaProps
  likers: { count: number; users: User[] }
  initialLiked: boolean
  initialBookmarked: boolean
  initialComments: CommentWithAuthor[]
  initialTags: AssetTag[]
  initialFilename: string
  initialCaption: string | null
}) {
  // Chrome toggle is mobile-only; desktop always shows top bar + side panel via CSS.
  const [chromeVisible, setChromeVisible] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetDetailsOpen, setSheetDetailsOpen] = useState(false)
  const [albumPickerOpen, setAlbumPickerOpen] = useState(false)
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(likers.count)
  const [bookmarked, setBookmarked] = useState(initialBookmarked)
  const [commentCount, setCommentCount] = useState(
    () => initialComments.filter((c) => !c.deletedAt).length,
  )
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()
  const toast = useToast()

  async function handleDelete(): Promise<void> {
    if (deleting) return
    if (!window.confirm('이 사진을 휴지통으로 옮길까요? 휴지통에서 다시 복원할 수 있어요.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/asset/${current.id}/delete`, { method: 'POST' })
      if (!res.ok) throw new Error()
      toast({ title: '휴지통으로 옮겼어요', variant: 'success' })
      router.push('/timeline')
      router.refresh()
    } catch {
      toast({ title: '삭제하지 못했어요. 잠시 후 다시 시도해주세요', variant: 'danger' })
      setDeleting(false)
    }
  }

  // 몰입형 뷰어 — 스크롤 잠금. (app) 레이아웃 main 의 pb-20(하단 네비 여백)이
  // 상세 화면에선 하단 네비가 숨겨져 빈 80px 스크롤을 만들었다. 뷰포트 스크롤은
  // <html> 가 주관하므로 documentElement 에 overflow:hidden 을 걸어야 막힌다
  // (body 만으론 안 됨).
  useEffect(() => {
    const html = document.documentElement
    const prevHtml = html.style.overflow
    const prevBody = document.body.style.overflow
    html.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      html.style.overflow = prevHtml
      document.body.style.overflow = prevBody
    }
  }, [])

  return (
    <div className="relative min-h-screen bg-black md:flex">
      {/* Image column: takes full width on mobile, flexes on desktop */}
      <div className="relative flex-1 min-w-0">
        <ViewerTopBar
          assetId={current.id}
          visible={chromeVisible}
          onInfo={() => {
            setSheetDetailsOpen(true)
            setSheetOpen(true)
          }}
          {...(canDelete ? { onDelete: handleDelete } : {})}
        />
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
          commentCount={commentCount}
          visible={chromeVisible}
          onCommentTap={() => {
            setSheetDetailsOpen(false)
            setSheetOpen(true)
          }}
          onAlbumTap={() => setAlbumPickerOpen(true)}
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
          commentCount={commentCount}
          onCommentCountChange={setCommentCount}
          initialComments={initialComments}
          initialTags={initialTags}
          initialFilename={initialFilename}
          initialCaption={initialCaption}
          initialDetailsOpen={sheetDetailsOpen}
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
          commentCount={commentCount}
          onCommentCountChange={setCommentCount}
          initialComments={initialComments}
          initialTags={initialTags}
          initialFilename={initialFilename}
          initialCaption={initialCaption}
          onAlbumTap={() => setAlbumPickerOpen(true)}
        />
      </aside>

      <AlbumPicker open={albumPickerOpen} onOpenChange={setAlbumPickerOpen} assetId={current.id} />
    </div>
  )
}
