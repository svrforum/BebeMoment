'use client'
import { useToast } from '@/lib/toast'
import { MoreHorizontal } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'

type Props = {
  albumId: string
  currentName: string
  hasChildrenOrPhotos: boolean
  parentId: string | null
}

export function AlbumMenu({ albumId, currentName, hasChildrenOrPhotos, parentId }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [name, setName] = useState(currentName)
  const [pending, setPending] = useState(false)

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
        throw new Error((err as { error?: string }).error ?? '이름 변경 실패')
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
    if (
      hasChildrenOrPhotos &&
      !confirm('안에 사진이나 하위 앨범이 있어요. 함께 삭제할까요?')
    ) {
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
        throw new Error((err as { error?: string }).error ?? '삭제 실패')
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
        aria-label="메뉴"
        className="flex h-9 w-9 items-center justify-center rounded-full text-base-600 transition hover:bg-base-100 active:scale-95 dark:text-base-300 dark:hover:bg-base-800"
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="닫기"
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
              이름 바꾸기
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                remove()
              }}
              className="block w-full px-4 py-2.5 text-left text-[13px] text-danger hover:bg-base-100 dark:hover:bg-base-800"
            >
              앨범 삭제
            </button>
          </div>
        </>
      )}

      {renameOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setRenameOpen(false)}
            className="absolute inset-0 -z-10 cursor-default bg-transparent"
          />
          <form
            onSubmit={submitRename}
            className="w-[320px] rounded-3xl bg-base-0 p-5 shadow-elevated dark:bg-base-900"
          >
            <h2 className="text-[17px] font-semibold tracking-tight">이름 바꾸기</h2>
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
                취소
              </button>
              <button
                type="submit"
                disabled={!name.trim() || pending}
                className="rounded-full bg-point-500 px-4 py-2 text-[13px] font-medium text-white transition active:scale-95 disabled:opacity-50"
              >
                저장
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
