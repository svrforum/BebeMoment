'use client'
import { setDisplayName } from '@/(app)/settings/actions'
import { Check, Pencil, X } from 'lucide-react'
import { useState } from 'react'

const MAX_LEN = 20

export function DisplayNameEditor({
  initial,
  badge,
}: {
  initial: string
  /** 역할 배지 등 이름 옆에 붙는 요소(편집 중에는 숨김). */
  badge?: React.ReactNode
}) {
  const [name, setName] = useState(initial)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const trimmed = draft.trim()
    if (!trimmed) {
      setError('이름을 입력해주세요.')
      return
    }
    if (trimmed === name) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const r = await setDisplayName({ displayName: trimmed })
      setName(r.displayName)
      setEditing(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setDraft(name)
            setError(null)
            setEditing(true)
          }}
          className="group flex min-w-0 items-center gap-1.5"
          aria-label="이름 변경"
        >
          <span className="truncate text-[16px] font-semibold text-base-900 dark:text-base-50">
            {name}
          </span>
          <Pencil className="h-3.5 w-3.5 shrink-0 text-base-400 transition-colors group-hover:text-point-500" />
        </button>
        {badge}
      </div>
    )
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <input
          // biome-ignore lint/a11y/noAutofocus: 인라인 편집 — 열자마자 입력 포커스가 자연스럽다
          autoFocus
          type="text"
          value={draft}
          maxLength={MAX_LEN}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="h-9 min-w-0 flex-1 rounded-xl border border-base-200 bg-transparent px-3 text-[15px] text-base-900 focus:border-point-500 focus:outline-none dark:border-base-700 dark:text-base-50"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-point-500 text-white disabled:opacity-50"
          aria-label="저장"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-base-100 text-base-500 dark:bg-base-800"
          aria-label="취소"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between px-1">
        <span className="text-[11px] text-danger">{error ?? ''}</span>
        <span className="text-[11px] tabular-nums text-base-400">
          {draft.length}/{MAX_LEN}
        </span>
      </div>
    </div>
  )
}
