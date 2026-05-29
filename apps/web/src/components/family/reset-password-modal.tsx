'use client'
import { Sheet } from '@/components/ui/sheet'
import { useToast } from '@/lib/toast'
import { Copy } from 'lucide-react'
import { useState, useTransition } from 'react'

type Props = {
  open: boolean
  onOpenChange: (next: boolean) => void
  membershipId: string
  displayName: string
}

export function ResetPasswordModal({ open, onOpenChange, membershipId, displayName }: Props) {
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
        setError(data.error ?? '링크 생성에 실패했어요')
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
    toast({ title: '복사에 실패했어요. 링크를 길게 눌러 직접 복사해주세요', variant: 'danger' })
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
            {displayName} 님 비밀번호 재설정
          </p>
          <p className="mt-1 text-sm text-base-500">
            링크를 만들어 멤버에게 직접 전달해주세요. 한 번만 사용할 수 있어요.
          </p>
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
                <Copy size={14} /> {copied ? '복사됨' : '복사'}
              </button>
            </div>
            {expiresAt && (
              <p className="text-center text-xs text-base-400">
                {new Date(expiresAt).toLocaleString('ko-KR')} 까지 유효
              </p>
            )}
            <button
              type="button"
              onClick={close}
              className="mt-2 inline-flex h-12 items-center justify-center rounded-2xl bg-base-100 text-base font-medium text-base-900 hover:bg-base-200 dark:bg-base-800 dark:text-base-50 dark:hover:bg-base-700"
            >
              닫기
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={generate}
            disabled={pending}
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-point-500 text-base font-semibold text-white transition-transform ease-ios active:scale-[0.98] disabled:opacity-60"
          >
            {pending ? '생성 중…' : '재설정 링크 만들기'}
          </button>
        )}
      </div>
    </Sheet>
  )
}
