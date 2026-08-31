'use client'
import { AlbumPicker } from '@/components/albums/album-picker'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { useToast } from '@/lib/toast'
import type { AssetUrls } from '@bebe/media-client'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CommentWithAuthor } from './comment-item'
import type { MetadataSection } from './metadata-section'
import { ViewerActionBar } from './viewer-action-bar'
import { ViewerBottomSheet } from './viewer-bottom-sheet'
import { ViewerImage } from './viewer-image'
import { ViewerInfoPanel } from './viewer-info-panel'
import { ViewerTopBar } from './viewer-top-bar'
import type { StoryViewerCtx } from '@/server/asset/viewer-story-ctx'

type Member = { id: string; displayName: string }
type User = { id: string; displayName: string; avatarPath: string | null }
type MetaProps = React.ComponentProps<typeof MetadataSection>
type AssetSlim = {
  id: string
  publicNo: number
  kind: 'image' | 'video'
  urls: AssetUrls | null
  videoSrc: string | null
  posterUrl: string | undefined
}
type Siblings = {
  prevId: string | undefined
  nextId: string | undefined
  prev: AssetSlim | null
  next: AssetSlim | null
}

export type NavigateTo = (assetId: string, direction: 'next' | 'prev') => void

export function ViewerShell({
  initialCurrent,
  initialSiblings,
  currentUserId,
  canDeleteAny,
  canDelete: canDeleteInitial,
  canAlbum,
  familyMembers,
  meta,
  likers,
  initialLiked,
  initialBookmarked,
  initialInWidget,
  initialComments,
  initialFilename,
  initialCaption,
  initialStoryCtx,
  sort = 'taken',
  viewerCtx = null,
}: {
  initialCurrent: AssetSlim
  initialSiblings: Siblings
  currentUserId: string
  canDeleteAny: boolean
  canDelete: boolean
  canAlbum: boolean
  familyMembers: Member[]
  meta: MetaProps
  likers: { count: number; users: User[] }
  initialLiked: boolean
  initialBookmarked: boolean
  initialInWidget: boolean
  initialComments: CommentWithAuthor[]
  initialFilename: string
  initialCaption: string | null
  initialStoryCtx: StoryViewerCtx | null
  sort?: 'taken' | 'uploaded'
  /** 어느 컬렉션에서 열렸는지(memories·saved·album:id 등) — 스와이프 이웃 스코프 유지용. */
  viewerCtx?: string | null
}) {
  // 핵심: current/siblings 는 STATE. SSR 페이지가 마운트되면 props 가 seed 로 들어오고,
  // 그 뒤 사용자가 스와이프하면 fetch('/api/asset/.../viewer-bundle') 결과로 state 만
  // 바꾼다 — 페이지 unmount/remount 가 없으니 chrome (X / ⋮ / 액션바 / Swiper) 가 그대로
  // 살아 있고 화면 깜빡임이 사라진다.
  const [currentSlim, setCurrentSlim] = useState<AssetSlim>(initialCurrent)
  const [siblings, setSiblings] = useState<Siblings>(initialSiblings)

  // 하드 네비(외부 링크 클릭 등) 로 새 props 가 들어오면 state 도 따라간다. URL 동기화는
  // navigateTo 가 history.replaceState 로 직접 하므로 보통은 발생하지 않지만 안전망.
  // initialCurrent.id 가 바뀔 때만 동기화 — 그 외 형제 메타 변화는 무시 (state 우선).
  // biome-ignore lint/correctness/useExhaustiveDependencies: 의도적으로 id 만 트리거.
  useEffect(() => {
    setCurrentSlim(initialCurrent)
    setSiblings(initialSiblings)
    setLiked(initialLiked)
    setBookmarked(initialBookmarked)
    setInWidget(initialInWidget)
    setLikersState(likers)
    setCount(likers.count)
    setCommentCount(initialComments.filter((c) => !c.deletedAt).length)
    setMetaState(meta)
    setFilenameState(initialFilename)
    setCaptionState(initialCaption)
    setStoryCtxState(initialStoryCtx ?? null)
    setCanDelete(canDeleteInitial)
  }, [initialCurrent.id])

  // 크롬(상단바·액션바)은 항상 표시 — 사진 탭으로 전체화면(크롬 숨김)되던 동작 제거(사용자 요청).
  const chromeVisible = true
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetDetailsOpen, setSheetDetailsOpen] = useState(false)
  const [albumPickerOpen, setAlbumPickerOpen] = useState(false)
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(likers.count)
  const [bookmarked, setBookmarked] = useState(initialBookmarked)
  const [inWidget, setInWidget] = useState(initialInWidget)
  const [likersState, setLikersState] = useState<{ count: number; users: User[] }>(likers)
  const [commentCount, setCommentCount] = useState(
    () => initialComments.filter((c) => !c.deletedAt).length,
  )
  const [metaState, setMetaState] = useState<MetaProps>(meta)
  const [filenameState, setFilenameState] = useState<string>(initialFilename)
  const [captionState, setCaptionState] = useState<string | null>(initialCaption)
  const [storyCtxState, setStoryCtxState] = useState<StoryViewerCtx | null>(initialStoryCtx ?? null)
  // 스와이프하면 자산이 바뀌므로 삭제 권한도 다시 받아야 한다(내가 올린 사진이 아닐 수 있다).
  const [canDelete, setCanDelete] = useState(canDeleteInitial)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const router = useRouter()
  const toast = useToast()
  const t = useTranslations('viewer')

  // 같은 자산으로 중복 navigate 가 떨어지는 걸 막기 위한 가드 (Swiper slide change 가
  // 빠르게 두 번 발사될 수 있음). 마지막 처리한 id 를 기억.
  const lastNavRef = useRef<string>(initialCurrent.id)

  const navigateTo = useCallback<NavigateTo>(
    async (assetId, direction) => {
      if (lastNavRef.current === assetId) return
      lastNavRef.current = assetId
      // 정렬 모드 + 컬렉션 ctx 를 URL·이웃 fetch 에 보존 — 스와이프가 같은 컬렉션·정렬을
      // 유지하도록(추억/앨범/북마크 등에서 열어도 그 안에서만 이동).
      const qp = new URLSearchParams()
      if (sort === 'uploaded') qp.set('sort', 'uploaded')
      if (viewerCtx) qp.set('ctx', viewerCtx)
      const sortQ = qp.toString() ? `?${qp.toString()}` : ''

      // Optimistic: 현재 siblings 에서 해당 슬롯을 즉시 current 로 승격.
      // URLs 가 이미 사인되어 있어 사진이 끊김 없이 이어진다.
      const optimisticSlim = direction === 'next' ? siblings.next : siblings.prev
      const optimisticMatched = !!(optimisticSlim && optimisticSlim.id === assetId)
      if (optimisticMatched && optimisticSlim) {
        setCurrentSlim(optimisticSlim)
      }

      // URL 도 즉시 동기화 — router.replace 는 RSC 를 트리거하므로 절대 쓰면 안 된다.
      // history.replaceState 로 무음 교체. 페이지 URL 은 publicNo 를 쓴다 (fetch 는
      // 아래에서 UUID assetId 로). optimistic 슬림이 있으면 즉시, 없으면 fetch 후 갱신.
      if (typeof window !== 'undefined' && optimisticMatched && optimisticSlim) {
        window.history.replaceState({}, '', `/detail/${optimisticSlim.publicNo}${sortQ}`)
      }

      // 권위 있는 새 번들 받아오기 — current 의 fresh signed URL + 새 prev/next +
      // 새 자산의 social state (좋아요·북마크·댓글수). chrome 의 controlled state 도 갱신.
      try {
        const res = await fetch(`/api/asset/${assetId}/viewer-bundle${sortQ}`)
        if (!res.ok) return
        const next = (await res.json()) as {
          current: AssetSlim
          prev: AssetSlim | null
          next: AssetSlim | null
          prevId: string | undefined
          nextId: string | undefined
          social?: {
            liked: boolean
            likeCount: number
            likers: { count: number; users: User[] }
            bookmarked: boolean
            inWidget: boolean
            commentCount: number
          }
          meta?: {
            takenAt: string
            takenAtSource: string
            width: number | null
            height: number | null
            sizeBytes: string
            mimeType: string
            cameraMake: string | null
            cameraModel: string | null
            gpsLat: number | null
            gpsLng: number | null
            exifRaw: Record<string, unknown> | null
            babies: { id: string; name: string }[]
          }
          filename?: string
          caption?: string | null
          storyCtx?: StoryViewerCtx | null
          canDelete?: boolean
        }
        // 사용자가 그 사이에 또 swipe 했으면 (assetId !== lastNavRef.current) 덮어쓰지 않는다.
        if (lastNavRef.current !== assetId) return
        // optimistic 으로 이미 같은 자산을 set 했으면 current 를 다시 set 하지 않는다 —
        // 새 fetch 의 signed URL 은 string 이 달라 <img src> 가 cache miss → blurhash 가
        // 잠깐 비치는 깜빡임의 원인. 같은 assetId 면 preloaded URL 그대로 유지하고
        // siblings/social/meta 만 갱신. (TTL 10분이라 곧 만료될 위험은 사실상 없음 —
        // 만약 만료되면 다음 swipe 시 재발급.)
        if (!optimisticMatched) {
          setCurrentSlim(next.current)
          if (typeof window !== 'undefined') {
            window.history.replaceState({}, '', `/detail/${next.current.publicNo}${sortQ}`)
          }
        }
        setSiblings({
          prevId: next.prevId,
          nextId: next.nextId,
          prev: next.prev,
          next: next.next,
        })
        if (typeof next.canDelete === 'boolean') setCanDelete(next.canDelete)
        if (next.social) {
          setLiked(next.social.liked)
          setCount(next.social.likeCount)
          setBookmarked(next.social.bookmarked)
          setInWidget(next.social.inWidget)
          setCommentCount(next.social.commentCount)
          setLikersState(next.social.likers)
        }
        if (next.meta) {
          setMetaState({
            takenAt: new Date(next.meta.takenAt),
            takenAtSource: next.meta.takenAtSource,
            width: next.meta.width,
            height: next.meta.height,
            // bigint 는 JSON-safe 하지 않아 문자열로 직렬화됨 — BigInt 로 복원.
            sizeBytes: BigInt(next.meta.sizeBytes),
            mimeType: next.meta.mimeType,
            cameraMake: next.meta.cameraMake,
            cameraModel: next.meta.cameraModel,
            gpsLat: next.meta.gpsLat,
            gpsLng: next.meta.gpsLng,
            exifRaw: next.meta.exifRaw,
            babies: next.meta.babies,
          })
        }
        if (typeof next.filename === 'string') setFilenameState(next.filename)
        if (next.caption !== undefined) setCaptionState(next.caption)
        if (next.storyCtx !== undefined) setStoryCtxState(next.storyCtx)
      } catch {
        // 무음 실패: optimistic state 유지. 다음 swipe 에서 다시 시도.
      }
    },
    [siblings.next, siblings.prev, sort, viewerCtx],
  )

  // 단일 삭제도 벌크 삭제와 동일하게 iOS풍 ConfirmSheet 로 — 네이티브 window.confirm
  // 은 다크모드 미적용 + 메인스레드 블록이라 프리미엄 감성을 깼다.
  async function doDelete(): Promise<void> {
    try {
      const res = await fetch(`/api/asset/${currentSlim.id}/delete`, { method: 'POST' })
      if (!res.ok) throw new Error()
      toast({ title: t('actions.movedToTrash'), variant: 'success' })
      router.push('/timeline')
      router.refresh()
    } catch {
      toast({ title: t('actions.deleteFailed'), variant: 'danger' })
      throw new Error('delete failed') // 시트가 닫히지 않게(재시도 가능)
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

  // ESC 로 뷰어 닫기. 단 시트/피커가 열려 있거나(자체 ESC 로 닫힘) 텍스트 입력에
  // 포커스가 있으면(댓글 작성 등) 가로채지 않는다.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (sheetOpen || sheetDetailsOpen || albumPickerOpen) return
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      if (el instanceof HTMLElement && el.isContentEditable) return
      e.preventDefault()
      if (typeof window !== 'undefined' && window.history.length > 1) router.back()
      else router.push('/timeline')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetOpen, sheetDetailsOpen, albumPickerOpen, router])

  // chrome 서브트리는 re-key 하지 않는다 — 화면에 항상 보이는 상단바·하단바·우측
  // 패널이 사진 전환마다 unmount/remount 하면 그 자체가 "깜빡임"이 된다.
  // ViewerTopBar/ActionBar/InfoPanel 은 모두 prop-driven (liked·count·bookmarked·
  // commentCount·meta 가 state) 이므로 props 만 갱신해도 충분하다. CommentList
  // 는 자체적으로 `[assetId]` useEffect 로 fresh fetch 한다. 시드 state 를
  // 가진 MetadataEditor 만 안쪽에서 `key={assetId}` 로 remount 시킨다.
  //
  // 단 ViewerBottomSheet 는 닫혀있을 때 보이지 않아 remount 가 시각적 깜빡임이 아니므로
  // 안의 MetadataEditor seed 까지 통째로 refresh 되도록 keyed remount 유지.
  const sheetKey = currentSlim.id

  return (
    // fixed inset-0 so the viewer covers the (app) layout's bottom nav + the
    // md:pl-60 sidenav padding. Without this the photo sat INSIDE the app
    // shell — bottom nav showed under the action bar and the timeline content
    // leaked through. View transitions still play correctly on a fixed root.
    <div className="fixed inset-0 z-50 bg-black overflow-hidden md:flex">
      {/* Image column: takes full width on mobile, flexes on desktop */}
      <div className="relative flex-1 min-w-0">
        <ViewerTopBar
          assetId={currentSlim.id}
          visible={chromeVisible}
          showDownload={canAlbum}
          inWidget={inWidget}
          onInfo={() => {
            setSheetDetailsOpen(true)
            setSheetOpen(true)
          }}
          {...(canDelete ? { onDelete: () => setConfirmDeleteOpen(true) } : {})}
        />
        <ViewerImage
          current={currentSlim}
          siblings={siblings}
          navigateTo={navigateTo}
          chromeVisible={chromeVisible}
          storyCtx={storyCtxState}
        />
      </div>

      {/* Mobile-only action bar + bottom sheet */}
      <div className="md:hidden">
        <ViewerActionBar
          assetId={currentSlim.id}
          liked={liked}
          setLiked={setLiked}
          count={count}
          setCount={setCount}
          bookmarked={bookmarked}
          setBookmarked={setBookmarked}
          commentCount={commentCount}
          visible={chromeVisible}
          canAlbum={canAlbum}
          onCommentTap={() => {
            setSheetDetailsOpen(false)
            setSheetOpen(true)
          }}
          onAlbumTap={() => setAlbumPickerOpen(true)}
        />
        <ViewerBottomSheet
          key={`sheet-${sheetKey}`}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          assetId={currentSlim.id}
          currentUserId={currentUserId}
          canDeleteAny={canDeleteAny}
          familyMembers={familyMembers}
          meta={metaState}
          likers={likersState}
          liked={liked}
          setLiked={setLiked}
          count={count}
          setCount={setCount}
          bookmarked={bookmarked}
          setBookmarked={setBookmarked}
          commentCount={commentCount}
          onCommentCountChange={setCommentCount}
          initialComments={initialComments}
          initialFilename={filenameState}
          initialCaption={captionState}
          initialDetailsOpen={sheetDetailsOpen}
        />
      </div>

      {/* Desktop-only info panel: always visible */}
      <aside className="hidden w-[360px] shrink-0 overflow-y-auto border-l border-base-200 bg-base-0 md:block dark:border-base-800 dark:bg-base-900">
        <ViewerInfoPanel
          assetId={currentSlim.id}
          currentUserId={currentUserId}
          canDeleteAny={canDeleteAny}
          familyMembers={familyMembers}
          meta={metaState}
          likers={likersState}
          liked={liked}
          setLiked={setLiked}
          count={count}
          setCount={setCount}
          bookmarked={bookmarked}
          setBookmarked={setBookmarked}
          commentCount={commentCount}
          onCommentCountChange={setCommentCount}
          initialComments={initialComments}
          initialFilename={filenameState}
          initialCaption={captionState}
          canAlbum={canAlbum}
          onAlbumTap={() => setAlbumPickerOpen(true)}
        />
      </aside>

      <AlbumPicker
        open={albumPickerOpen}
        onOpenChange={setAlbumPickerOpen}
        assetId={currentSlim.id}
      />

      <ConfirmSheet
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={t('actions.trashConfirmTitle')}
        description={t('actions.trashConfirmDescription')}
        confirmLabel={t('actions.trashConfirmLabel')}
        confirmingLabel={t('actions.trashConfirmingLabel')}
        onConfirm={doDelete}
      />
    </div>
  )
}
