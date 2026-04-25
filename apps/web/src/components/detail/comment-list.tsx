'use client'
import { useFamilySSE } from '@/lib/sse'
import { useCallback, useState } from 'react'
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
}: {
  assetId: string
  currentUserId: string
  currentUser?: Author
  canDeleteAny: boolean
  familyMembers: Member[]
  initialComments: CommentWithAuthor[]
}) {
  const [comments, setComments] = useState<CommentWithAuthor[]>(initialComments)
  const [optimistic, setOptimistic] = useState<CommentWithAuthor[]>([])

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
        displayName: '나',
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
    [assetId, currentUser, currentUserId],
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

  const merged = [...comments, ...optimistic]

  return (
    <div className="space-y-1">
      {merged.length === 0 ? (
        <p className="py-2 text-sm text-base-500">첫 댓글을 남겨보세요.</p>
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
      )}
      <div className="pt-3">
        <CommentComposer
          assetId={assetId}
          familyMembers={familyMembers}
          onSubmit={refetch}
          onOptimistic={onOptimistic}
          onOptimisticFail={onOptimisticFail}
        />
      </div>
    </div>
  )
}
