'use client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { useToast } from '@/lib/toast'
import { MoreHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

type Member = { id: string; displayName: string }

export type CommentWithAuthor = {
  id: string
  assetId: string
  body: string
  mentionedUserIds: string[]
  editedAt: Date | string | null
  createdAt: Date | string
  deletedAt: Date | string | null
  author: { id: string; displayName: string; avatarPath: string | null }
}

function renderBody(body: string, members: Member[]): React.ReactNode {
  const parts = body.split(/(@[^\s@]{1,20})/g)
  return parts.map((p, i) => {
    const key = `${i}:${p}`
    if (p.startsWith('@')) {
      const name = p.slice(1)
      const isMember = members.some((m) => m.displayName === name)
      if (isMember) {
        return (
          <span key={key} className="font-medium text-point-500">
            {p}
          </span>
        )
      }
    }
    return <span key={key}>{p}</span>
  })
}

export function CommentItem({
  comment,
  currentUserId,
  canDeleteAny,
  familyMembers,
  isOptimistic = false,
  onChanged,
}: {
  comment: CommentWithAuthor
  currentUserId: string
  canDeleteAny: boolean
  familyMembers: Member[]
  isOptimistic?: boolean
  onChanged?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const [menuOpen, setMenuOpen] = useState(false)
  const toast = useToast()
  const t = useTranslations('social')

  const isOwn = comment.author.id === currentUserId
  const canEdit = isOwn && !comment.deletedAt
  const canDelete = (isOwn || canDeleteAny) && !comment.deletedAt

  async function save() {
    try {
      const res = await fetch(`/api/asset/${comment.assetId}/comments/${comment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft }),
      })
      if (!res.ok) throw new Error('failed')
      setEditing(false)
      onChanged?.()
    } catch {
      toast({ title: t('comment.editFailed'), variant: 'danger' })
    }
  }

  async function remove() {
    try {
      const res = await fetch(`/api/asset/${comment.assetId}/comments/${comment.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('failed')
      onChanged?.()
    } catch {
      toast({ title: t('comment.deleteFailed'), variant: 'danger' })
    }
  }

  const ts = typeof comment.createdAt === 'string' ? new Date(comment.createdAt) : comment.createdAt

  if (comment.deletedAt) {
    return <div className="py-2 text-sm italic text-base-500">{t('comment.deleted')}</div>
  }

  return (
    <div className={cn('group py-2', isOptimistic && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="text-xs text-base-500">
            <span className="font-medium text-base-900 dark:text-base-100">
              {comment.author.displayName}
            </span>
            {' · '}
            {ts.toLocaleString('ko-KR', {
              year: '2-digit',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })}
            {comment.editedAt && ` · ${t('comment.edited')}`}
          </div>
          {editing ? (
            <div className="mt-1 space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setEditing(false)
                    setDraft(comment.body)
                  }
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save()
                }}
                rows={2}
                maxLength={2000}
                className="w-full rounded-xl border border-base-200 bg-base-0 px-3 py-2 text-sm dark:border-base-800 dark:bg-base-900"
              />
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={save}>
                  {t('comment.save')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false)
                    setDraft(comment.body)
                  }}
                >
                  {t('comment.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-0.5 whitespace-pre-wrap text-sm">
              {renderBody(comment.body, familyMembers)}
            </div>
          )}
        </div>
        {(canEdit || canDelete) && !editing && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={t('comment.menu')}
              className={cn(
                'rounded p-1 text-base-500 md:opacity-0 md:group-hover:opacity-100',
                menuOpen && 'opacity-100 md:opacity-100',
              )}
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 rounded-xl border border-base-200 bg-base-0 shadow-lg dark:border-base-800 dark:bg-base-900">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      setEditing(true)
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-base-100 dark:hover:bg-base-800"
                  >
                    {t('comment.edit')}
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      remove()
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-danger hover:bg-base-100 dark:hover:bg-base-800"
                  >
                    {t('comment.delete')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
