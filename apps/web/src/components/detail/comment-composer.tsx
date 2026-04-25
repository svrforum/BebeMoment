'use client'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/toast'
import { useEffect, useRef, useState } from 'react'

type Member = { id: string; displayName: string }

export function CommentComposer({
  assetId,
  familyMembers,
  onSubmit,
}: {
  assetId: string
  familyMembers: Member[]
  onSubmit?: () => void
}) {
  const [body, setBody] = useState('')
  const [pending, setPending] = useState(false)
  const [showMention, setShowMention] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const toast = useToast()

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
    try {
      const res = await fetch(`/api/asset/${assetId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (!res.ok) throw new Error('failed')
      setBody('')
      onSubmit?.()
      toast({ title: '댓글이 등록됐어요', variant: 'success' })
    } catch {
      toast({ title: '댓글을 등록하지 못했어요', variant: 'danger' })
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
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit()
        }}
        placeholder="댓글 입력… (@이름 으로 멘션)"
        rows={2}
        maxLength={2000}
        className="w-full rounded-xl border px-3 py-2 text-sm"
      />
      {showMention && candidates.length > 0 && (
        <div className="absolute bottom-full left-0 z-10 mb-1 rounded-xl border bg-base-0 shadow-lg dark:bg-base-900">
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
          등록
        </Button>
      </div>
    </div>
  )
}
