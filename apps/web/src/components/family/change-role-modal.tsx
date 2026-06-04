'use client'
import { Sheet } from '@/components/ui/sheet'
import type { Role } from '@bebe/db-public'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

type Props = {
  open: boolean
  onOpenChange: (next: boolean) => void
  membershipId: string
  displayName: string
  currentRole: Role
}

const CHOICE_VALUES: ('guardian' | 'family')[] = ['guardian', 'family']

export function ChangeRoleModal({
  open,
  onOpenChange,
  membershipId,
  displayName,
  currentRole,
}: Props) {
  const t = useTranslations('family')
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
        setError(data.error ?? t('roleModal.error'))
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
            {t('roleModal.title', { name: displayName })}
          </p>
          <p className="mt-1 text-sm text-base-500">{t('roleModal.subtitle')}</p>
        </div>
        <div className="flex flex-col gap-2">
          {CHOICE_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSelected(value)}
              className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                selected === value
                  ? 'border-point-500 bg-point-500/5'
                  : 'border-base-200 dark:border-base-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-semibold text-base-900 dark:text-base-50">
                  {t(`roles.${value}`)}
                </span>
                {selected === value && (
                  <span className="text-xs font-semibold text-point-500">
                    {t('roleModal.selected')}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[12px] text-base-500">{t(`roleModal.desc.${value}`)}</p>
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
            {pending
              ? t('roleModal.changing')
              : selected === currentRole
                ? t('roleModal.currentRole')
                : t('roleModal.change')}
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
