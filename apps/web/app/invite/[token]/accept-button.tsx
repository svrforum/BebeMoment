'use client'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function AcceptButton({ token }: { token: string }) {
  const t = useTranslations('invite')
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setSubmitting(true)
    setError(null)
    const res = await fetch('/api/invite/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    if (!res.ok) {
      setSubmitting(false)
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? t('accept.error'))
      return
    }
    router.push('/timeline')
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        onClick={accept}
        disabled={submitting}
        size="lg"
        className="w-full text-[17px]"
      >
        {submitting ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            {t('accept.joining')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-2">
            {t('accept.cta')}
            <ArrowRight size={18} />
          </span>
        )}
      </Button>
      {error && (
        <p className="rounded-xl bg-danger/10 px-4 py-3 text-center text-sm text-danger">{error}</p>
      )}
    </div>
  )
}
