'use client'
import { useToast } from '@/lib/toast'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'

type Props = {
  parentId?: string | null
  parentName?: string
}

export function AlbumCreateButton({ parentId = null, parentName }: Props) {
  const t = useTranslations('album')
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
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
        body: JSON.stringify({
          name: name.trim(),
          ...(parentId ? { parentId } : {}),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? t('create.failed'))
      }
      const { album } = (await res.json()) as { album: { id: string } }
      setName('')
      setOpen(false)
      router.push(`/albums/${album.id}`)
    } catch (e) {
      toast({ title: (e as Error).message, variant: 'danger' })
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-1.5 rounded-full bg-point-500 px-3.5 text-[13px] font-medium text-white shadow-sm transition-transform ease-ios active:scale-95 hover:bg-point-600"
      >
        <Plus size={16} strokeWidth={2.6} />
        <span>{t('create.button')}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <button
            type="button"
            aria-label={t('create.close')}
            onClick={() => setOpen(false)}
            className="absolute inset-0 -z-10 cursor-default bg-transparent"
          />
          <form
            onSubmit={submit}
            className="w-[320px] rounded-3xl bg-base-0 p-5 shadow-elevated dark:bg-base-900"
          >
            <h2 className="text-[17px] font-semibold tracking-tight">{t('create.title')}</h2>
            {parentName && (
              <p className="mt-1 text-[12px] text-base-500">
                {t('create.parent', { name: parentName })}
              </p>
            )}
            <input
              // biome-ignore lint/a11y/noAutofocus: modal opened by intent
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('create.namePlaceholder')}
              maxLength={80}
              className="mt-4 w-full rounded-2xl border border-base-200 bg-transparent px-4 py-3 text-[14px] outline-none focus:border-point-500 dark:border-base-800"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full px-4 py-2 text-[13px] font-medium text-base-500 hover:bg-base-100 dark:hover:bg-base-800"
              >
                {t('create.cancel')}
              </button>
              <button
                type="submit"
                disabled={!name.trim() || pending}
                className="rounded-full bg-point-500 px-4 py-2 text-[13px] font-medium text-white transition active:scale-95 hover:bg-point-600 disabled:opacity-50"
              >
                {t('create.submit')}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
