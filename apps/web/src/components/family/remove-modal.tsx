'use client'
import { Sheet } from '@/components/ui/sheet'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

type Props = {
  open: boolean
  onOpenChange: (next: boolean) => void
  membershipId: string
  displayName: string
}

export function RemoveModal({ open, onOpenChange, membershipId, displayName }: Props) {
  const router = useRouter()
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

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
        setError(data.error ?? '제외에 실패했어요')
        return
      }
      onOpenChange(false)
      setConfirm('')
      router.refresh()
    })
  }

  return (
    <Sheet open={open} onOpenChange={(n) => !pending && onOpenChange(n)}>
      <div className="flex flex-col gap-4 px-1 py-2">
        <div className="text-center">
          <p className="text-base font-semibold text-base-900 dark:text-base-50">
            {displayName} 님을 가족에서 제외할까요?
          </p>
          <p className="mt-1 text-sm text-base-500">
            그 멤버는 더 이상 사진·일기를 볼 수 없어요. 올린 사진은 그대로 남아요. 추후 다시 초대할
            수 있어요.
          </p>
        </div>
        <div>
          <p className="mb-1.5 text-sm text-base-500">
            확인하려면 <span className="font-semibold text-base-900 dark:text-base-50">제외</span>{' '}
            라고 입력해주세요
          </p>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="제외"
            className="w-full rounded-2xl border border-base-200 bg-base-0 px-3 py-2.5 text-sm text-base-900 outline-none focus:border-red-400 dark:border-base-700 dark:bg-base-900 dark:text-base-50"
          />
        </div>
        {error && <p className="text-center text-sm text-red-500">{error}</p>}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={pending || confirm !== '제외'}
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-red-500 text-base font-semibold text-white transition-transform ease-ios active:scale-[0.98] hover:bg-red-600 disabled:opacity-40"
          >
            {pending ? '제외 중…' : '가족에서 제외'}
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-base-100 text-base font-medium text-base-900 hover:bg-base-200 disabled:opacity-60 dark:bg-base-800 dark:text-base-50 dark:hover:bg-base-700"
          >
            취소
          </button>
        </div>
      </div>
    </Sheet>
  )
}
