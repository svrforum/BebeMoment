'use client'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/toast'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

type Member = { id: string; displayName: string }

export type OptimisticDraft = {
  body: string
  tempId: string
}

export function CommentComposer({
  assetId,
  familyMembers,
  onSubmit,
  onOptimistic,
  onOptimisticFail,
}: {
  assetId: string
  familyMembers: Member[]
  onSubmit?: () => void
  onOptimistic?: (draft: OptimisticDraft) => void
  onOptimisticFail?: (tempId: string) => void
}) {
  const [body, setBody] = useState('')
  const [pending, setPending] = useState(false)
  const [showMention, setShowMention] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const toast = useToast()
  const t = useTranslations('social')

  useEffect(() => {
    const match = body.match(/@([^\s@]{0,20})$/)
    if (match) {
      setShowMention(true)
      setMentionQuery(match[1] ?? '')
    } else {
      setShowMention(false)
    }
  }, [body])

  function insertMention(name: string) {
    const next = body.replace(/@([^\s@]{0,20})$/, `@${name} `)
    setBody(next)
    setShowMention(false)
    textareaRef.current?.focus()
  }

  const candidates = familyMembers.filter((m) => m.displayName.startsWith(mentionQuery))

  async function submit() {
    if (!body.trim() || pending) return
    setPending(true)
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const draftBody = body
    onOptimistic?.({ body: draftBody, tempId })
    setBody('')
    try {
      const res = await fetch(`/api/asset/${assetId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draftBody }),
      })
      if (!res.ok) throw new Error('failed')
      onSubmit?.()
    } catch {
      onOptimisticFail?.(tempId)
      setBody(draftBody)
      toast({
        title: t('comment.submitFailed'),
        variant: 'danger',
        action: { label: t('comment.retry'), onClick: submit },
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onFocus={(e) => {
          // 모바일 키보드가 올라올 때 작성칸이 가려지지 않도록 보이는 영역으로 끌어올린다.
          requestAnimationFrame(() =>
            e.target.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
          )
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit()
        }}
        placeholder={t('comment.placeholder')}
        rows={2}
        maxLength={2000}
        className="w-full rounded-xl border border-base-200 bg-base-0 px-3 py-2 text-sm dark:border-base-800 dark:bg-base-900"
      />
      {showMention && candidates.length > 0 && (
        <div className="absolute bottom-full left-0 z-10 mb-1 rounded-xl border border-base-200 bg-base-0 shadow-lg dark:border-base-800 dark:bg-base-900">
          {candidates.map((m) => (
            <button
              type="button"
              key={m.id}
              onClick={() => insertMention(m.displayName)}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-base-100 dark:hover:bg-base-800"
            >
              @{m.displayName}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex justify-end">
        <Button type="button" onClick={submit} disabled={!body.trim() || pending} size="sm">
          {t('comment.submit')}
        </Button>
      </div>
    </div>
  )
}
