'use client'
import { useToast } from '@/lib/toast'
import { MoreHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'

type Props = {
  albumId: string
  currentName: string
  hasChildrenOrPhotos: boolean
  parentId: string | null
  secret?: boolean
  canToggleSecret?: boolean
}

type AlbumTreeNode = {
  id: string
  name: string
  depth: number
  children: AlbumTreeNode[]
}

/** 트리를 평탄화하되 excludeId 노드(와 그 하위 전체)는 빼서 이동 대상 목록을 만든다. */
function flattenExcept(
  nodes: AlbumTreeNode[],
  excludeId: string,
  acc: { id: string; name: string; depth: number }[] = [],
): { id: string; name: string; depth: number }[] {
  for (const n of nodes) {
    if (n.id === excludeId) continue
    acc.push({ id: n.id, name: n.name, depth: n.depth })
    flattenExcept(n.children ?? [], excludeId, acc)
  }
  return acc
}

export function AlbumMenu({
  albumId,
  currentName,
  hasChildrenOrPhotos,
  parentId,
  secret = false,
  canToggleSecret = false,
}: Props) {
  const t = useTranslations('album')
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [targets, setTargets] = useState<{ id: string; name: string; depth: number }[]>([])
  const [name, setName] = useState(currentName)
  const [pending, setPending] = useState(false)

  const openMove = async () => {
    setMoveOpen(true)
    try {
      const r = await fetch('/api/albums/tree')
      const data = (await r.json()) as { tree: AlbumTreeNode[] }
      // 자기 자신(과 그 하위 전체)은 부모가 될 수 없으니 제외 — 순환 방지.
      setTargets(flattenExcept(data.tree ?? [], albumId))
    } catch {
      toast({ title: t('menu.loadFailed'), variant: 'danger' })
    }
  }

  const submitMove = async (newParentId: string | null) => {
    if (pending) return
    setPending(true)
    try {
      const res = await fetch(`/api/albums/${albumId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: newParentId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? t('menu.moveFailed'))
      }
      setMoveOpen(false)
      toast({ title: newParentId ? t('menu.movedToChild') : t('menu.movedToRoot') })
      router.refresh()
    } catch (e) {
      toast({ title: (e as Error).message, variant: 'danger' })
    } finally {
      setPending(false)
    }
  }

  const toggleSecret = async () => {
    setPending(true)
    try {
      const res = await fetch(`/api/albums/${albumId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: !secret }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? t('menu.changeFailed'))
      }
      toast({ title: secret ? t('menu.secretRemoved') : t('menu.secretEnabled') })
      router.refresh()
    } catch (e) {
      toast({ title: (e as Error).message, variant: 'danger' })
    } finally {
      setPending(false)
    }
  }

  const submitRename = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || pending) return
    setPending(true)
    try {
      const res = await fetch(`/api/albums/${albumId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? t('menu.renameFailed'))
      }
      setRenameOpen(false)
      router.refresh()
    } catch (e) {
      toast({ title: (e as Error).message, variant: 'danger' })
    } finally {
      setPending(false)
    }
  }

  const remove = async () => {
    if (hasChildrenOrPhotos && !confirm(t('menu.deleteConfirm'))) {
      return
    }
    setPending(true)
    try {
      const url = hasChildrenOrPhotos
        ? `/api/albums/${albumId}?cascade=true`
        : `/api/albums/${albumId}`
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? t('menu.deleteFailed'))
      }
      router.replace(parentId ? `/albums/${parentId}` : '/albums')
    } catch (e) {
      toast({ title: (e as Error).message, variant: 'danger' })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('menu.menu')}
        className="flex h-9 w-9 items-center justify-center rounded-full text-base-600 transition hover:bg-base-100 active:scale-95 dark:text-base-300 dark:hover:bg-base-800"
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label={t('menu.close')}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default bg-transparent"
          />
          <div className="absolute right-0 top-full z-40 mt-2 w-44 overflow-hidden rounded-2xl border border-base-200/70 bg-base-0 shadow-elevated dark:border-base-800/70 dark:bg-base-900">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setRenameOpen(true)
              }}
              className="block w-full px-4 py-2.5 text-left text-[13px] hover:bg-base-100 dark:hover:bg-base-800"
            >
              {t('menu.rename')}
            </button>
            {canToggleSecret && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setOpen(false)
                  toggleSecret()
                }}
                className="block w-full px-4 py-2.5 text-left text-[13px] hover:bg-base-100 disabled:opacity-50 dark:hover:bg-base-800"
              >
                {secret ? t('menu.unsecret') : t('menu.makeSecret')}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                openMove()
              }}
              className="block w-full px-4 py-2.5 text-left text-[13px] hover:bg-base-100 dark:hover:bg-base-800"
            >
              {t('menu.move')}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                remove()
              }}
              className="block w-full px-4 py-2.5 text-left text-[13px] text-danger hover:bg-base-100 dark:hover:bg-base-800"
            >
              {t('menu.delete')}
            </button>
          </div>
        </>
      )}

      {moveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5 backdrop-blur-sm">
          <button
            type="button"
            aria-label={t('menu.close')}
            onClick={() => setMoveOpen(false)}
            className="absolute inset-0 -z-10 cursor-default bg-transparent"
          />
          <div className="flex max-h-[70vh] w-[360px] flex-col rounded-3xl bg-base-0 p-5 shadow-elevated dark:bg-base-900">
            <h2 className="text-[17px] font-semibold tracking-tight">{t('menu.moveTitle')}</h2>
            <p className="mt-1 text-[12px] text-base-500">
              {t('menu.moveDescription', { name: currentName })}
            </p>
            <div className="mt-4 flex-1 space-y-0.5 overflow-y-auto">
              <button
                type="button"
                disabled={pending || parentId === null}
                onClick={() => submitMove(null)}
                className="block w-full rounded-xl px-3 py-2.5 text-left text-[14px] font-medium hover:bg-base-100 disabled:opacity-40 dark:hover:bg-base-800"
              >
                {t('menu.moveToRoot')}
              </button>
              {targets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={pending || parentId === t.id}
                  onClick={() => submitMove(t.id)}
                  className="block w-full truncate rounded-xl px-3 py-2.5 text-left text-[14px] hover:bg-base-100 disabled:opacity-40 dark:hover:bg-base-800"
                  style={{ paddingLeft: `${12 + t.depth * 16}px` }}
                >
                  {t.depth > 0 && <span className="text-base-400">↳ </span>}
                  {t.name}
                </button>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setMoveOpen(false)}
                className="rounded-full px-4 py-2 text-[13px] font-medium text-base-500 hover:bg-base-100 dark:hover:bg-base-800"
              >
                {t('menu.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {renameOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <button
            type="button"
            aria-label={t('menu.close')}
            onClick={() => setRenameOpen(false)}
            className="absolute inset-0 -z-10 cursor-default bg-transparent"
          />
          <form
            onSubmit={submitRename}
            className="w-[320px] rounded-3xl bg-base-0 p-5 shadow-elevated dark:bg-base-900"
          >
            <h2 className="text-[17px] font-semibold tracking-tight">{t('menu.renameTitle')}</h2>
            <input
              // biome-ignore lint/a11y/noAutofocus: modal opened by intent
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="mt-4 w-full rounded-2xl border border-base-200 bg-transparent px-4 py-3 text-[14px] outline-none focus:border-point-500 dark:border-base-800"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameOpen(false)}
                className="rounded-full px-4 py-2 text-[13px] font-medium text-base-500 hover:bg-base-100 dark:hover:bg-base-800"
              >
                {t('menu.cancel')}
              </button>
              <button
                type="submit"
                disabled={!name.trim() || pending}
                className="rounded-full bg-point-500 px-4 py-2 text-[13px] font-medium text-white transition active:scale-95 disabled:opacity-50"
              >
                {t('menu.save')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
