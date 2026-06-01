'use client'
import { Check, Pencil, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export function PersonNameEditor({
  personId,
  initialName,
}: {
  personId: string
  initialName: string | null
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialName ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/people/${personId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: value.trim() === '' ? null : value.trim() }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? '저장에 실패했어요')
      }
      setEditing(false)
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-base-100 px-3 py-1.5 text-sm font-medium text-base-700 transition-colors active:bg-base-200 dark:bg-base-800 dark:text-base-200"
      >
        <Pencil size={13} />
        {initialName ? '이름 수정' : '이름 붙이기'}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save()
            if (e.key === 'Escape') setEditing(false)
          }}
          maxLength={100}
          placeholder="이름"
          className="min-w-0 flex-1 rounded-xl border border-base-200 bg-base-0 px-3 py-2 text-sm outline-none focus:border-point-400 dark:border-base-700 dark:bg-base-900"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-point-500 text-white disabled:opacity-50"
          aria-label="저장"
        >
          <Check size={17} />
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false)
            setValue(initialName ?? '')
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-base-100 text-base-500 dark:bg-base-800"
          aria-label="취소"
        >
          <X size={17} />
        </button>
      </div>
      {error && <p className="px-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}
