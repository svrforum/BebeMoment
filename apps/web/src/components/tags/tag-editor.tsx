'use client'
import { useToast } from '@/lib/toast'
import { Plus } from 'lucide-react'
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { TagChip } from './tag-chip'

export type AssetTag = {
  id: string
  name: string
  slug: string
  color?: string | null
}

type Props = {
  assetId: string
  initial: AssetTag[]
}

type CandidateTag = AssetTag & { assetCount?: number }

export function TagEditor({ assetId, initial }: Props) {
  const toast = useToast()
  const [tags, setTags] = useState<AssetTag[]>(initial)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<CandidateTag[]>([])
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Fetch family tags whenever popover opens — keeps autocomplete fresh.
  useEffect(() => {
    if (!open) return
    let alive = true
    fetch('/api/tags?withCounts=true')
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        if (!alive) return
        setCandidates(data.tags as CandidateTag[])
      })
      .catch(() => {
        // best-effort: keep popover open with empty list
      })
    return () => {
      alive = false
    }
  }, [open])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const attached = useMemo(() => new Set(tags.map((t) => t.id)), [tags])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return candidates.filter((c) => !attached.has(c.id)).slice(0, 8)
    return candidates
      .filter((c) => !attached.has(c.id))
      .filter(
        (c) => c.name.toLowerCase().startsWith(q) || c.slug.startsWith(q),
      )
      .slice(0, 8)
  }, [candidates, query, attached])

  const exactExists = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return false
    return candidates.some(
      (c) => c.name.toLowerCase() === q || c.slug === q,
    )
  }, [candidates, query])

  const attach = useCallback(
    async (body: { tagIds?: string[]; name?: string }) => {
      setPending(true)
      try {
        const res = await fetch(`/api/asset/${assetId}/tags`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error((err as { error?: string }).error ?? '태그 추가 실패')
        }
        const data = (await res.json()) as { tags: AssetTag[] }
        setTags(data.tags)
        setQuery('')
        inputRef.current?.focus()
      } catch (e) {
        toast({ title: (e as Error).message, variant: 'danger' })
      } finally {
        setPending(false)
      }
    },
    [assetId, toast],
  )

  const detach = useCallback(
    async (tagId: string) => {
      const prev = tags
      setTags((curr) => curr.filter((t) => t.id !== tagId))
      try {
        const res = await fetch(`/api/asset/${assetId}/tags/${tagId}`, {
          method: 'DELETE',
        })
        if (!res.ok) throw new Error('제거 실패')
      } catch (e) {
        setTags(prev)
        toast({ title: (e as Error).message, variant: 'danger' })
      }
    },
    [assetId, tags, toast],
  )

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[0]) {
        attach({ tagIds: [filtered[0].id] })
      } else if (query.trim()) {
        attach({ name: query.trim() })
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <TagChip
          key={t.id}
          name={t.name}
          color={t.color ?? null}
          onRemove={() => detach(t.id)}
        />
      ))}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-base-300 px-2.5 text-[12px] font-medium text-base-500 transition-colors hover:border-base-400 hover:text-base-700 dark:border-base-700 dark:text-base-400 dark:hover:border-base-500 dark:hover:text-base-200"
      >
        <Plus size={12} strokeWidth={2.5} /> 태그
      </button>
      {open && (
        <div
          ref={popoverRef}
          className="absolute left-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-2xl border border-base-200/70 bg-base-0 shadow-elevated dark:border-base-800/70 dark:bg-base-900"
        >
          <input
            ref={inputRef}
            // biome-ignore lint/a11y/noAutofocus: popover is opened by intent
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="태그 검색 또는 새 태그 입력"
            className="w-full border-b border-base-200 bg-transparent px-3.5 py-2.5 text-[13px] outline-none dark:border-base-800"
          />
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => attach({ tagIds: [t.id] })}
                  className="flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-[13px] transition-colors hover:bg-base-100 dark:hover:bg-base-800"
                >
                  <span className="truncate">{t.name}</span>
                  {typeof t.assetCount === 'number' && (
                    <span className="text-[11px] tabular-nums text-base-400">
                      {t.assetCount}
                    </span>
                  )}
                </button>
              </li>
            ))}
            {query.trim() && !exactExists && (
              <li>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => attach({ name: query.trim() })}
                  className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[13px] text-point-500 transition-colors hover:bg-point-500/10"
                >
                  <Plus size={14} strokeWidth={2.4} />
                  <span className="truncate">"{query.trim()}" 새 태그 만들기</span>
                </button>
              </li>
            )}
            {filtered.length === 0 && !query.trim() && (
              <li className="px-3.5 py-3 text-[12px] text-base-500">
                아직 태그가 없어요. 입력해서 만들어보세요.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
