'use client'
import { Sheet } from '@/components/ui/sheet'
import { useToast } from '@/lib/toast'
import { Check, ChevronRight, FolderOpen, FolderPlus, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useEffect, useState } from 'react'

type AlbumNode = {
  id: string
  name: string
  parentId: string | null
  depth: number
  children: AlbumNode[]
  childCount: number
}

type Props = {
  open: boolean
  onOpenChange: (next: boolean) => void
  /** Single id (back-compat) — equivalent to assetIds of length 1. */
  assetId?: string
  /** Bulk add: tap one album → all assets attached at once. */
  assetIds?: string[]
  /** Story (diary entry) mode — attaches a journal entry instead of assets. */
  entryId?: string
  /** Optional close-after-attach hook so the caller can clear selection. */
  onAttached?: (albumId: string) => void
}

/**
 * Bottom-sheet album picker. Shows a collapsible tree of family albums;
 * tapping any node attaches the target asset(s) — or a story (diary entry)
 * when `entryId` is given — to it. Inline "새 앨범" creates a root album and
 * immediately attaches.
 */
export function AlbumPicker({ open, onOpenChange, assetId, assetIds, entryId, onAttached }: Props) {
  const t = useTranslations('album')
  const toast = useToast()
  const router = useRouter()
  const [tree, setTree] = useState<AlbumNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<string | null>(null)
  const [recent, setRecent] = useState<Set<string>>(new Set())

  const targetIds = assetIds && assetIds.length > 0 ? assetIds : assetId ? [assetId] : []
  const isEntry = Boolean(entryId)
  const hasTarget = isEntry ? Boolean(entryId) : targetIds.length > 0

  const loadTree = useCallback(async () => {
    try {
      const r = await fetch('/api/albums/tree')
      if (!r.ok) throw r
      const data = await r.json()
      setTree(data.tree as AlbumNode[])
    } catch {
      toast({ title: t('picker.loadFailed'), variant: 'danger' })
    }
  }, [toast, t])

  useEffect(() => {
    if (!open) return
    loadTree()
  }, [open, loadTree])

  // Reset the "recently added" checkmarks when the picker reopens for a
  // different asset / batch.
  useEffect(() => {
    if (!open) {
      setRecent(new Set())
    }
  }, [open])

  const attach = async (albumId: string) => {
    if (!hasTarget) return
    setPending(albumId)
    try {
      const res = await fetch(`/api/albums/${albumId}/${isEntry ? 'entries' : 'assets'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEntry ? { entryIds: [entryId] } : { assetIds: targetIds }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? t('picker.addFailed'))
      }
      const result = (await res.json()) as { added: number; total: number }
      setRecent((prev) => new Set(prev).add(albumId))
      if (!isEntry && targetIds.length > 1) {
        const dup = targetIds.length - result.added
        toast({
          title: t('picker.added', { count: result.added }),
          ...(dup > 0 ? { description: t('picker.duplicates', { count: dup }) } : {}),
        })
      }
      onAttached?.(albumId)
      // Re-render the page behind the sheet (timeline / detail / album views)
      // so the attachment shows without a manual reload.
      router.refresh()
      // 추가 후 피커 자동 닫기 — 체크 표시를 잠깐 보여준 뒤 시트 내림.
      window.setTimeout(() => onOpenChange(false), 500)
    } catch (e) {
      toast({ title: (e as Error).message, variant: 'danger' })
    } finally {
      setPending(null)
    }
  }

  const toggleExpand = (albumId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(albumId)) next.delete(albumId)
      else next.add(albumId)
      return next
    })
  }

  const headerCount = isEntry
    ? t('picker.headerStory')
    : targetIds.length > 1
      ? t('picker.headerPhotos', { count: targetIds.length })
      : t('picker.header')

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={headerCount}>
      <div className="flex flex-col gap-3 pb-8">
        <CreateRow
          onCreated={async (albumId) => {
            // Refresh the tree so the just-created album appears in the list,
            // then attach the target asset(s) to it.
            await loadTree()
            await attach(albumId)
          }}
        />
        {tree.length === 0 ? (
          <p className="px-2 py-4 text-center text-[13px] text-base-500">{t('picker.empty')}</p>
        ) : (
          <ul className="flex flex-col">
            {tree.map((node) => (
              <AlbumRow
                key={node.id}
                node={node}
                expanded={expanded}
                onToggle={toggleExpand}
                onAttach={attach}
                pending={pending}
                recent={recent}
              />
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  )
}

function AlbumRow({
  node,
  expanded,
  onToggle,
  onAttach,
  pending,
  recent,
}: {
  node: AlbumNode
  expanded: Set<string>
  onToggle: (id: string) => void
  onAttach: (id: string) => void
  pending: string | null
  recent: Set<string>
}) {
  const t = useTranslations('album')
  const isOpen = expanded.has(node.id)
  const isPending = pending === node.id
  const isAdded = recent.has(node.id)
  const indent = node.depth * 16

  return (
    <li>
      <div
        className="flex items-center gap-1 rounded-2xl px-1 py-0.5"
        style={{ paddingLeft: indent }}
      >
        {node.children.length > 0 ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-label={isOpen ? t('picker.collapse') : t('picker.expand')}
            className="flex h-7 w-7 items-center justify-center rounded-full text-base-400 transition hover:bg-base-100 dark:hover:bg-base-800"
          >
            <ChevronRight
              size={14}
              strokeWidth={2.4}
              className={`transition-transform ease-ios ${isOpen ? 'rotate-90' : ''}`}
            />
          </button>
        ) : (
          <span className="h-7 w-7" />
        )}
        <button
          type="button"
          onClick={() => onAttach(node.id)}
          disabled={isPending}
          className="flex flex-1 items-center gap-2 rounded-2xl px-2 py-2 text-left text-[14px] transition hover:bg-base-100 disabled:opacity-50 dark:hover:bg-base-800"
        >
          <FolderOpen size={16} className="text-base-400" strokeWidth={2} />
          <span className="flex-1 truncate">{node.name}</span>
          {isAdded ? (
            <Check size={16} className="text-success" strokeWidth={2.4} />
          ) : (
            <Plus size={14} className="text-base-400" strokeWidth={2.2} />
          )}
        </button>
      </div>
      {isOpen && node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <AlbumRow
              key={child.id}
              node={child}
              expanded={expanded}
              onToggle={onToggle}
              onAttach={onAttach}
              pending={pending}
              recent={recent}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function CreateRow({ onCreated }: { onCreated: (id: string) => void }) {
  const t = useTranslations('album')
  const toast = useToast()
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || pending) return
    setPending(true)
    try {
      const res = await fetch('/api/albums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? t('picker.createFailed'))
      }
      const { album } = (await res.json()) as { album: { id: string } }
      setName('')
      onCreated(album.id)
    } catch (e) {
      toast({ title: (e as Error).message, variant: 'danger' })
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex items-center gap-2 rounded-2xl border border-dashed border-base-300 px-3 py-2 dark:border-base-700"
    >
      <FolderPlus size={16} className="text-base-400" strokeWidth={2} />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('picker.createPlaceholder')}
        className="flex-1 bg-transparent text-[13px] outline-none"
        maxLength={80}
      />
      {name.trim() && (
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-point-500 px-3 py-1 text-[12px] font-medium text-white transition active:scale-95 disabled:opacity-50"
        >
          {t('picker.create')}
        </button>
      )}
    </form>
  )
}
