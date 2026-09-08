'use client'
import { Check, Pencil, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export function PersonNameEditor({
  personId,
  initialName,
  onEditingChange,
}: {
  personId: string
  initialName: string | null
  /** 편집 중에는 헤더의 다른 액션을 숨겨 입력창에 자리를 내준다(좁은 화면 넘침 방지). */
  onEditingChange?: (editing: boolean) => void
}) {
  const t = useTranslations('misc')
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialName ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
    onEditingChange?.(editing)
  }, [editing, onEditingChange])

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
        throw new Error(body.error ?? t('people.saveFailed'))
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
        {initialName ? t('people.editName') : t('people.addName')}
      </button>
    )
  }

  return (
    // 헤더의 오른쪽 슬롯은 줄어들지 않는다(app-header). 입력창이 기본 폭으로 열리면
    // 저장·취소 버튼이 화면 밖으로 밀려나므로 뷰포트에 맞춰 상한을 둔다.
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save()
            if (e.key === 'Escape') setEditing(false)
          }}
          maxLength={100}
          placeholder={t('people.namePlaceholder')}
          className="w-[min(60vw,16rem)] min-w-0 flex-1 rounded-xl border border-base-200 bg-base-0 px-3 py-2 text-sm outline-none focus:border-point-400 dark:border-base-700 dark:bg-base-900"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-point-500 text-white disabled:opacity-50"
          aria-label={t('people.save')}
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
          aria-label={t('people.cancel')}
        >
          <X size={17} />
        </button>
      </div>
      {error && <p className="px-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}
