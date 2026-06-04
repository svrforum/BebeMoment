'use client'
import { useFeature } from '@/lib/features'
import { useFamilySSE } from '@/lib/sse'
import { useTranslations } from 'next-intl'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { CommentComposer, type OptimisticDraft } from './comment-composer'
import { CommentItem, type CommentWithAuthor } from './comment-item'

type Member = { id: string; displayName: string }
type Author = { id: string; displayName: string; avatarPath: string | null }

export function CommentList({
  assetId,
  currentUserId,
  currentUser,
  canDeleteAny,
  familyMembers,
  initialComments,
  onCountChange,
  fill = false,
  header,
}: {
  assetId: string
  currentUserId: string
  currentUser?: Author
  canDeleteAny: boolean
  familyMembers: Member[]
  initialComments: CommentWithAuthor[]
  onCountChange?: (count: number) => void
  /**
   * Instagram-style sheet layout: this component becomes a flex column that
   * fills its parent — `header` + comments scroll in a single region and the
   * composer is pinned to the bottom (above the keyboard). Requires a parent
   * with a bounded height (e.g. Sheet `fill`).
   */
  fill?: boolean
  /** Rendered at the top of the scroll region in `fill` mode (like/save, 세부정보). */
  header?: ReactNode
}) {
  const [comments, setComments] = useState<CommentWithAuthor[]>(initialComments)
  const [optimistic, setOptimistic] = useState<CommentWithAuthor[]>([])
  const commentsOn = useFeature('comments')
  const t = useTranslations('social')

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/asset/${assetId}/comments`)
    if (!res.ok) return
    const data = (await res.json()) as { items: CommentWithAuthor[] }
    setComments(data.items)
    setOptimistic([])
  }, [assetId])

  const onOptimistic = useCallback(
    (draft: OptimisticDraft) => {
      const author: Author = currentUser ?? {
        id: currentUserId,
        displayName: t('comment.me'),
        avatarPath: null,
      }
      const ghost: CommentWithAuthor = {
        id: draft.tempId,
        assetId,
        body: draft.body,
        mentionedUserIds: [],
        editedAt: null,
        createdAt: new Date(),
        deletedAt: null,
        author,
      }
      setOptimistic((prev) => [...prev, ghost])
    },
    [assetId, currentUser, currentUserId, t],
  )

  const onOptimisticFail = useCallback((tempId: string) => {
    setOptimistic((prev) => prev.filter((c) => c.id !== tempId))
  }, [])

  useFamilySSE(
    useCallback(
      (event) => {
        if (event.type === 'comment.added' && event.assetId === assetId) refetch()
        else if (event.type === 'comment.updated' && event.assetId === assetId) refetch()
        else if (event.type === 'comment.deleted' && event.assetId === assetId) refetch()
      },
      [assetId, refetch],
    ),
  )

  // 클라이언트 사이드 사진 전환 후엔 props.initialComments 가 직전 자산의 데이터 (stale).
  // chrome 이 assetId 키로 remount 되므로 여기서 한 번 refetch 해 신선한 댓글로 교체.
  // 첫 마운트(SSR initial) 도 한 번 추가 호출이 발생하지만 비용은 작고 일관성이 더 중요.
  useEffect(() => {
    refetch()
  }, [refetch])

  const merged = [...comments, ...optimistic]
  const liveCount = merged.filter((c) => !c.deletedAt).length

  useEffect(() => {
    onCountChange?.(liveCount)
  }, [liveCount, onCountChange])

  if (!commentsOn) {
    return fill ? <div className="flex min-h-0 flex-1 flex-col">{header}</div> : <>{header}</>
  }

  const list =
    merged.length === 0 ? (
      <p className="py-2 text-sm text-base-500">{t('comment.empty')}</p>
    ) : (
      <div className="divide-y divide-base-100 dark:divide-base-800">
        {merged.map((c) => (
          <CommentItem
            key={c.id}
            comment={c}
            currentUserId={currentUserId}
            canDeleteAny={canDeleteAny}
            familyMembers={familyMembers}
            isOptimistic={c.id.startsWith('tmp-')}
            onChanged={refetch}
          />
        ))}
      </div>
    )

  const composer = (
    <CommentComposer
      assetId={assetId}
      familyMembers={familyMembers}
      onSubmit={refetch}
      onOptimistic={onOptimistic}
      onOptimisticFail={onOptimisticFail}
    />
  )

  if (fill) {
    // 시트가 고정 높이 flex 컬럼 → 헤더+댓글은 한 영역에서 스크롤되고,
    // 작성칸은 하단에 진짜로 고정돼 모바일 키보드 위에 항상 보인다.
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-5 pt-1 pb-2">
          {header}
          {list}
        </div>
        <div className="shrink-0 border-t border-base-100 bg-base-0 px-5 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 dark:border-base-800 dark:bg-base-900">
          {composer}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {list}
      <div className="pt-3">{composer}</div>
    </div>
  )
}
