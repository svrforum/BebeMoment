'use client'
import { Sheet } from '@/components/ui/sheet'
import { AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type ReactNode, useTransition } from 'react'

type Props = {
  open: boolean
  onOpenChange: (next: boolean) => void
  /** Primary heading inside the sheet. */
  title: string
  /** Sub-text below the heading. Optional. */
  description?: string
  /** Label on the destructive primary button. */
  confirmLabel?: string
  /** Label on the cancel button. */
  cancelLabel?: string
  /** Optional pending-state label shown on the primary button while the
   *  async confirm action is running. */
  confirmingLabel?: string
  /**
   * Async function to run when the user confirms. The sheet stays open
   * with the primary button disabled until this resolves; on resolution
   * the sheet closes automatically.
   */
  onConfirm: () => Promise<void>
  /** Optional override icon. Default = red triangle warning. */
  icon?: ReactNode
}

/**
 * Reusable destructive-confirm sheet. Used by single-asset delete (diary
 * detail) and bulk-delete (timeline selection) to enforce a two-step
 * "are you sure?" before any irreversible action.
 */
export function ConfirmSheet({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  confirmingLabel,
  onConfirm,
  icon,
}: Props) {
  const t = useTranslations('common')
  const resolvedConfirmLabel = confirmLabel ?? t('delete')
  const resolvedCancelLabel = cancelLabel ?? t('cancel')
  const resolvedConfirmingLabel = confirmingLabel ?? t('deleting')
  const [pending, startTransition] = useTransition()

  const handleConfirm = () => {
    startTransition(async () => {
      await onConfirm()
      onOpenChange(false)
    })
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        onOpenChange(next)
      }}
    >
      <div className="flex flex-col gap-4 px-1 py-2">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-500/15">
          {icon ?? <AlertTriangle size={22} strokeWidth={2.2} />}
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-base-900 dark:text-base-50">{title}</p>
          {description && <p className="mt-1 text-sm text-base-500">{description}</p>}
        </div>
        <div className="mt-2 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-red-500 text-base font-semibold text-white shadow-sm transition-transform ease-ios active:scale-[0.98] hover:bg-red-600 disabled:opacity-60"
          >
            {pending ? resolvedConfirmingLabel : resolvedConfirmLabel}
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-base-100 text-base font-medium text-base-900 transition-colors hover:bg-base-200 disabled:opacity-60 dark:bg-base-800 dark:text-base-50 dark:hover:bg-base-700"
          >
            {resolvedCancelLabel}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
