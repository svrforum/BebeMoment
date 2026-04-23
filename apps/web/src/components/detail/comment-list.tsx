'use client'
import { useFamilySSE } from '@/lib/sse'
import { useCallback, useState } from 'react'
import { CommentComposer } from './comment-composer'
import { CommentItem, type CommentWithAuthor } from './comment-item'

type Member = { id: string; displayName: string }

export function CommentList({
  assetId,
  currentUserId,
  canDeleteAny,
  familyMembers,
  initialComments,
}: {
  assetId: string
  currentUserId: string
  canDeleteAny: boolean
  familyMembers: Member[]
  initialComments: CommentWithAuthor[]
}) {
  const [comments, setComments] = useState<CommentWithAuthor[]>(initialComments)

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/asset/${assetId}/comments`)
    if (!res.ok) return
    const data = (await res.json()) as { items: CommentWithAuthor[] }
    setComments(data.items)
  }, [assetId])

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

  return (
    <div className="space-y-1">
      {comments.length === 0 ? (
        <p className="py-2 text-sm text-base-500">첫 댓글을 남겨보세요.</p>
      ) : (
        <div className="divide-y divide-base-100 dark:divide-base-800">
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              currentUserId={currentUserId}
              canDeleteAny={canDeleteAny}
              familyMembers={familyMembers}
              onChanged={refetch}
            />
          ))}
        </div>
      )}
      <div className="pt-3">
        <CommentComposer assetId={assetId} familyMembers={familyMembers} onSubmit={refetch} />
      </div>
    </div>
  )
}
