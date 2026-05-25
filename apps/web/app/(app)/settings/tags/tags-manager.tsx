'use client'
import { TagChip } from '@/components/tags/tag-chip'
import { useToast } from '@/lib/toast'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'

type Tag = {
  id: string
  name: string
  slug: string
  color: string | null
  assetCount: number
}

export function TagsManager({ initial }: { initial: Tag[] }) {
  const router = useRouter()
  const toast = useToast()
  const [tags, setTags] = useState<Tag[]>(initial)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [newName, setNewName] = useState('')
  const [pending, setPending] = useState(false)

  const refresh = async () => {
    const res = await fetch('/api/tags?withCounts=true')
    if (!res.ok) return
    const data = (await res.json()) as { tags: Tag[] }
    setTags(data.tags)
  }

  const create = async (e: FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || pending) return
    setPending(true)
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? '추가 실패')
      }
      setNewName('')
      await refresh()
    } catch (e) {
      toast({ title: (e as Error).message, variant: 'danger' })
    } finally {
      setPending(false)
    }
  }

  const saveRename = async (tagId: string) => {
    if (!editName.trim()) {
      setEditingId(null)
      return
    }
    setPending(true)
    try {
      const res = await fetch(`/api/tags/${tagId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? '이름 변경 실패')
      }
      setEditingId(null)
      await refresh()
      router.refresh()
    } catch (e) {
      toast({ title: (e as Error).message, variant: 'danger' })
    } finally {
      setPending(false)
    }
  }

  const remove = async (tag: Tag) => {
    if (
      tag.assetCount > 0 &&
      !confirm(`"${tag.name}" 태그가 ${tag.assetCount}장 사진에 달려있어요. 정말 삭제할까요?`)
    ) {
      return
    }
    setPending(true)
    try {
      const res = await fetch(`/api/tags/${tag.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? '삭제 실패')
      }
      await refresh()
      router.refresh()
    } catch (e) {
      toast({ title: (e as Error).message, variant: 'danger' })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={create}
        className="flex items-center gap-2 rounded-2xl border border-dashed border-base-300 px-3 py-2 dark:border-base-700"
      >
        <Plus size={16} className="text-base-400" strokeWidth={2} />
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="새 태그 이름"
          maxLength={40}
          className="flex-1 bg-transparent text-[13px] outline-none"
        />
        {newName.trim() && (
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-point-500 px-3 py-1 text-[12px] font-medium text-white transition active:scale-95 disabled:opacity-50"
          >
            추가
          </button>
        )}
      </form>

      {tags.length === 0 ? (
        <p className="px-2 py-6 text-center text-[13px] text-base-500">아직 태그가 없어요</p>
      ) : (
        <ul className="rounded-2xl border border-base-200 bg-base-0 dark:border-base-800 dark:bg-base-900">
          {tags.map((t, i) => (
            <li
              key={t.id}
              className={`flex items-center gap-2 px-4 py-2.5 ${
                i < tags.length - 1 ? 'border-b border-base-100 dark:border-base-800/60' : ''
              }`}
            >
              {editingId === t.id ? (
                <input
                  // biome-ignore lint/a11y/noAutofocus: edit triggered by intent
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => saveRename(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveRename(t.id)
                    else if (e.key === 'Escape') setEditingId(null)
                  }}
                  className="flex-1 rounded-lg border border-base-200 bg-transparent px-2 py-1 text-[13px] outline-none focus:border-point-500 dark:border-base-700"
                />
              ) : (
                <div className="flex flex-1 items-center gap-2">
                  <TagChip name={t.name} color={t.color} />
                  <span className="text-[12px] tabular-nums text-base-400">· {t.assetCount}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setEditingId(t.id)
                  setEditName(t.name)
                }}
                aria-label="이름 바꾸기"
                className="flex h-8 w-8 items-center justify-center rounded-full text-base-400 transition hover:bg-base-100 hover:text-base-700 dark:hover:bg-base-800"
              >
                <Pencil size={14} strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => remove(t)}
                aria-label="삭제"
                className="flex h-8 w-8 items-center justify-center rounded-full text-base-400 transition hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
