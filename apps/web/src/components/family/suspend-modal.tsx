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

export function SuspendModal({ open, onOpenChange, membershipId, displayName }: Props) {
  const t = useTranslations('family')
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const close = () => {
    setReason('')
    setError(null)
    onOpenChange(false)
  }

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const res = await fetch(`/api/admin/members/${membershipId}/suspend`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? t('suspendModal.error'))
        return
      }
      onOpenChange(false)
      setReason('')
      router.refresh()
    })
  }

  return (
    <Sheet open={open} onOpenChange={(n) => !pending && (n ? onOpenChange(true) : close())}>
      <div className="flex flex-col gap-4 px-1 py-2">
        <div className="text-center">
          <p className="text-base font-semibold text-base-900 dark:text-base-50">
            {t('suspendModal.title', { name: displayName })}
          </p>
          <p className="mt-1 text-sm text-base-500">{t('suspendModal.subtitle')}</p>
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          placeholder={t('suspendModal.reasonPlaceholder')}
          className="min-h-[64px] w-full rounded-2xl border border-base-200 bg-base-0 px-3 py-2 text-sm text-base-900 outline-none focus:border-point-400 dark:border-base-700 dark:bg-base-900 dark:text-base-50"
        />
        {error && <p className="text-center text-sm text-red-500">{error}</p>}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-red-500 text-base font-semibold text-white transition-transform ease-ios active:scale-[0.98] hover:bg-red-600 disabled:opacity-60"
          >
            {pending ? t('suspendModal.suspending') : t('suspendModal.confirm')}
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
