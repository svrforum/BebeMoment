'use client'
import { AlbumPicker } from '@/components/albums/album-picker'
import type { AssetTag } from '@/components/tags/tag-editor'
import { useToast } from '@/lib/toast'
import type { AssetUrls } from '@bebe/media-client'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
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
  initialCurrent: AssetSlim
  initialSiblings: Siblings
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
    setLikersState(likers)
    setCount(likers.count)
    setCommentCount(initialComments.filter((c) => !c.deletedAt).length)
    setMetaState(meta)
    setFilenameState(initialFilename)
    setCaptionState(initialCaption)
  }, [initialCurrent.id])

  const [chromeVisible, setChromeVisible] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetDetailsOpen, setSheetDetailsOpen] = useState(false)
  const [albumPickerOpen, setAlbumPickerOpen] = useState(false)
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(likers.count)
  const [bookmarked, setBookmarked] = useState(initialBookmarked)
  const [likersState, setLikersState] = useState<{ count: number; users: User[] }>(likers)
  const [commentCount, setCommentCount] = useState(
    () => initialComments.filter((c) => !c.deletedAt).length,
  )
  const [metaState, setMetaState] = useState<MetaProps>(meta)
  const [filenameState, setFilenameState] = useState<string>(initialFilename)
  const [captionState, setCaptionState] = useState<string | null>(initialCaption)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()
  const toast = useToast()

  // 같은 자산으로 중복 navigate 가 떨어지는 걸 막기 위한 가드 (Swiper slide change 가
  // 빠르게 두 번 발사될 수 있음). 마지막 처리한 id 를 기억.
  const lastNavRef = useRef<string>(initialCurrent.id)

  const navigateTo = useCallback<NavigateTo>(
    async (assetId, direction) => {
      if (lastNavRef.current === assetId) return
      lastNavRef.current = assetId

      // Optimistic: 현재 siblings 에서 해당 슬롯을 즉시 current 로 승격.
      // URLs 가 이미 사인되어 있어 사진이 끊김 없이 이어진다.
      const optimisticSlim = direction === 'next' ? siblings.next : siblings.prev
      if (optimisticSlim && optimisticSlim.id === assetId) {
        setCurrentSlim(optimisticSlim)
      }

      // URL 도 즉시 동기화 — router.replace 는 RSC 를 트리거하므로 절대 쓰면 안 된다.
      // history.replaceState 로 무음 교체.
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', `/detail/${assetId}`)
      }

      // 권위 있는 새 번들 받아오기 — current 의 fresh signed URL + 새 prev/next +
      // 새 자산의 social state (좋아요·북마크·댓글수). chrome 의 controlled state 도 갱신.
      try {
        const res = await fetch(`/api/asset/${assetId}/viewer-bundle`)
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
        }
        // 사용자가 그 사이에 또 swipe 했으면 (assetId !== lastNavRef.current) 덮어쓰지 않는다.
        if (lastNavRef.current !== assetId) return
        setCurrentSlim(next.current)
        setSiblings({
          prevId: next.prevId,
          nextId: next.nextId,
          prev: next.prev,
          next: next.next,
        })
        if (next.social) {
          setLiked(next.social.liked)
          setCount(next.social.likeCount)
          setBookmarked(next.social.bookmarked)
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
      } catch {
        // 무음 실패: optimistic state 유지. 다음 swipe 에서 다시 시도.
      }
    },
    [siblings.next, siblings.prev],
  )

  async function handleDelete(): Promise<void> {
    if (deleting) return
    if (!window.confirm('이 사진을 휴지통으로 옮길까요? 휴지통에서 다시 복원할 수 있어요.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/asset/${currentSlim.id}/delete`, { method: 'POST' })
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

  // chrome 서브트리는 currentSlim.id 로 re-key — 안에서 likes/bookmarks/comments 를
  // 자체적으로 fetch 하므로 새 사진마다 깔끔히 마운트되며 초기 props 가 다시 적용된다.
  // 단, 첫 진입의 initialLiked/initialBookmarked/initialComments 는 SSR 페이지의 그것이라
  // 다음 사진 navigate 후엔 stale — chrome 내부 컴포넌트가 마운트 시 useEffect 로
  // 자기 자산 데이터를 다시 fetch 하므로 잠시 잘못된 상태가 보일 수 있다 (수용 가능 —
  // 사진 자체는 끊김 없음).
  const chromeKey = currentSlim.id

  return (
    // fixed inset-0 so the viewer covers the (app) layout's bottom nav + the
    // md:pl-60 sidenav padding. Without this the photo sat INSIDE the app
    // shell — bottom nav showed under the action bar and the timeline content
    // leaked through. View transitions still play correctly on a fixed root.
    <div className="fixed inset-0 z-50 bg-black overflow-hidden md:flex">
      {/* Image column: takes full width on mobile, flexes on desktop */}
      <div className="relative flex-1 min-w-0">
        <ViewerTopBar
          key={`top-${chromeKey}`}
          assetId={currentSlim.id}
          visible={chromeVisible}
          onInfo={() => {
            setSheetDetailsOpen(true)
            setSheetOpen(true)
          }}
          {...(canDelete ? { onDelete: handleDelete } : {})}
        />
        <ViewerImage
          current={currentSlim}
          siblings={siblings}
          navigateTo={navigateTo}
          chromeVisible={chromeVisible}
          onToggleChrome={() => setChromeVisible((v) => !v)}
        />
      </div>

      {/* Mobile-only action bar + bottom sheet */}
      <div className="md:hidden">
        <ViewerActionBar
          key={`actbar-${chromeKey}`}
          assetId={currentSlim.id}
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
          key={`sheet-${chromeKey}`}
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
          initialTags={initialTags}
          initialFilename={filenameState}
          initialCaption={captionState}
          initialDetailsOpen={sheetDetailsOpen}
        />
      </div>

      {/* Desktop-only info panel: always visible */}
      <aside className="hidden w-[360px] shrink-0 overflow-y-auto border-l border-base-200 bg-base-0 md:block dark:border-base-800 dark:bg-base-900">
        <ViewerInfoPanel
          key={`panel-${chromeKey}`}
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
          initialTags={initialTags}
          initialFilename={filenameState}
          initialCaption={captionState}
          onAlbumTap={() => setAlbumPickerOpen(true)}
        />
      </aside>

      <AlbumPicker
        open={albumPickerOpen}
        onOpenChange={setAlbumPickerOpen}
        assetId={currentSlim.id}
      />
    </div>
  )
}
