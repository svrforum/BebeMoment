'use client'
import { Sheet } from '@/components/ui/sheet'
import type { Role } from '@bebe/db-public'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

type Props = {
  open: boolean
  onOpenChange: (next: boolean) => void
  membershipId: string
  displayName: string
  currentRole: Role
}

const CHOICES: { value: 'guardian' | 'family'; label: string; desc: string }[] = [
  { value: 'guardian', label: '보호자', desc: '업로드·기록·앨범·멤버 초대까지 가능' },
  { value: 'family', label: '가족', desc: '기본은 보기·댓글·좋아요 (관리자 설정으로 확장 가능)' },
]

export function ChangeRoleModal({
  open,
  onOpenChange,
  membershipId,
  displayName,
  currentRole,
}: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<'guardian' | 'family'>(
    currentRole === 'guardian' ? 'guardian' : 'family',
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // 모달을 다시 열 때 현재 역할로 초기화.
  useEffect(() => {
    if (open) setSelected(currentRole === 'guardian' ? 'guardian' : 'family')
  }, [open, currentRole])

  const close = () => {
    setError(null)
    onOpenChange(false)
  }

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const res = await fetch(`/api/admin/members/${membershipId}/role`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: selected }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? '역할 변경에 실패했어요')
        return
      }
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Sheet open={open} onOpenChange={(n) => !pending && (n ? onOpenChange(true) : close())}>
      <div className="flex flex-col gap-4 px-1 py-2">
        <div className="text-center">
          <p className="text-base font-semibold text-base-900 dark:text-base-50">
            {displayName} 님의 역할
          </p>
          <p className="mt-1 text-sm text-base-500">권한 수준을 선택하세요.</p>
        </div>
        <div className="flex flex-col gap-2">
          {CHOICES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setSelected(c.value)}
              className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                selected === c.value
                  ? 'border-point-500 bg-point-500/5'
                  : 'border-base-200 dark:border-base-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-semibold text-base-900 dark:text-base-50">
                  {c.label}
                </span>
                {selected === c.value && (
                  <span className="text-xs font-semibold text-point-500">선택됨</span>
                )}
              </div>
              <p className="mt-0.5 text-[12px] text-base-500">{c.desc}</p>
            </button>
          ))}
        </div>
        {error && <p className="text-center text-sm text-red-500">{error}</p>}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={pending || selected === currentRole}
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-point-500 text-base font-semibold text-white transition-transform ease-ios active:scale-[0.98] hover:bg-point-600 disabled:opacity-60"
          >
            {pending ? '변경 중…' : selected === currentRole ? '현재 역할' : '역할 변경'}
          </button>
          <button
            type="button"
            onClick={close}
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
