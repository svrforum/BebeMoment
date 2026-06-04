'use client'
import { Sheet } from '@/components/ui/sheet'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

type Props = {
  open: boolean
  onOpenChange: (next: boolean) => void
  membershipId: string
  displayName: string
}

export function RemoveModal({ open, onOpenChange, membershipId, displayName }: Props) {
  const t = useTranslations('family')
  const router = useRouter()
  const confirmWord = t('removeModal.confirmWord')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const close = () => {
    setConfirm('')
    setError(null)
    onOpenChange(false)
  }

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const res = await fetch(`/api/admin/members/${membershipId}/remove`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? t('removeModal.error'))
        return
      }
      onOpenChange(false)
      setConfirm('')
      router.refresh()
    })
  }

  return (
    <Sheet open={open} onOpenChange={(n) => !pending && (n ? onOpenChange(true) : close())}>
      <div className="flex flex-col gap-4 px-1 py-2">
        <div className="text-center">
          <p className="text-base font-semibold text-base-900 dark:text-base-50">
            {t('removeModal.title', { name: displayName })}
          </p>
          <p className="mt-1 text-sm text-base-500">{t('removeModal.subtitle')}</p>
        </div>
        <div>
          <p className="mb-1.5 text-sm text-base-500">
            {t.rich('removeModal.confirmHint', {
              word: confirmWord,
              b: (chunks) => (
                <span className="font-semibold text-base-900 dark:text-base-50">{chunks}</span>
              ),
            })}
          </p>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={confirmWord}
            className="w-full rounded-2xl border border-base-200 bg-base-0 px-3 py-2.5 text-sm text-base-900 outline-none focus:border-red-400 dark:border-base-700 dark:bg-base-900 dark:text-base-50"
          />
        </div>
        {error && <p className="text-center text-sm text-red-500">{error}</p>}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={pending || confirm !== confirmWord}
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-red-500 text-base font-semibold text-white transition-transform ease-ios active:scale-[0.98] hover:bg-red-600 disabled:opacity-40"
          >
            {pending ? t('removeModal.removing') : t('removeModal.confirm')}
          </button>
          <button
            type="button"
            onClick={close}
            disabled={pending}
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-base-100 text-base font-medium text-base-900 hover:bg-base-200 disabled:opacity-60 dark:bg-base-800 dark:text-base-50 dark:hover:bg-base-700"
          >
            {t('actions.cancel')}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
