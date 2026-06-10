'use client'
import { Sheet } from '@/components/ui/sheet'
import { useToast } from '@/lib/toast'
import { Copy } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

type Props = {
  open: boolean
  onOpenChange: (next: boolean) => void
  membershipId: string
  displayName: string
}

export function ResetPasswordModal({ open, onOpenChange, membershipId, displayName }: Props) {
  const t = useTranslations('family')
  const locale = useLocale()
  const toast = useToast()
  const [url, setUrl] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  const generate = () => {
    setError(null)
    startTransition(async () => {
      const res = await fetch(`/api/admin/members/${membershipId}/reset-password`, {
        method: 'POST',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? t('resetModal.error'))
        return
      }
      setUrl(data.url)
      setExpiresAt(data.expiresAt)
    })
  }

  const copy = async () => {
    if (!url) return
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
        return
      } catch {}
    }
    toast({ title: t('resetModal.copyError'), variant: 'danger' })
  }

  const close = () => {
    onOpenChange(false)
    setUrl(null)
    setExpiresAt(null)
    setError(null)
  }

  return (
    <Sheet open={open} onOpenChange={(n) => !pending && (n ? onOpenChange(true) : close())}>
      <div className="flex flex-col gap-4 px-1 py-2">
        <div className="text-center">
          <p className="text-base font-semibold text-base-900 dark:text-base-50">
            {t('resetModal.title', { name: displayName })}
          </p>
          <p className="mt-1 text-sm text-base-500">{t('resetModal.subtitle')}</p>
        </div>
        {error && <p className="text-center text-sm text-red-500">{error}</p>}
        {url ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 rounded-2xl border border-base-200 bg-base-50 px-3 py-2 dark:border-base-700 dark:bg-base-900">
              <span className="min-w-0 flex-1 truncate text-sm text-base-700 dark:text-base-200">
                {url}
              </span>
              <button
                type="button"
                onClick={copy}
                className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-point-500 px-3 py-1.5 text-sm font-semibold text-white"
              >
                <Copy size={14} /> {copied ? t('resetModal.copied') : t('resetModal.copy')}
              </button>
            </div>
            {expiresAt && (
              <p className="text-center text-xs text-base-400">
                {t('resetModal.validUntil', { date: new Date(expiresAt).toLocaleString(locale) })}
              </p>
            )}
            <button
              type="button"
              onClick={close}
              className="mt-2 inline-flex h-12 items-center justify-center rounded-2xl bg-base-100 text-base font-medium text-base-900 hover:bg-base-200 dark:bg-base-800 dark:text-base-50 dark:hover:bg-base-700"
            >
              {t('actions.close')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={generate}
            disabled={pending}
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-point-500 text-base font-semibold text-white transition-transform ease-ios active:scale-[0.98] disabled:opacity-60"
          >
            {pending ? t('resetModal.generating') : t('resetModal.generate')}
          </button>
        )}
      </div>
    </Sheet>
  )
}
