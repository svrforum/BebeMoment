'use client'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'

type Props = {
  /**
   * Server action bound to the entry id. Wrapped in a confirm sheet so
   * a stray tap on the trash icon can never delete by accident.
   */
  onDelete: () => Promise<void>
}

/**
 * Small destructive button for the diary detail header. Tap opens a
 * confirm dialog ("정말 삭제할까요?"); only after the user confirms does
 * the bound server action run.
 */
export function StoryDeleteButton({ onDelete }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="삭제"
        className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium text-red-500 transition-colors hover:bg-red-50 active:scale-95 dark:hover:bg-red-500/10"
      >
        <Trash2 size={13} strokeWidth={2.2} />
        <span>삭제</span>
      </button>

      <ConfirmSheet
        open={open}
        onOpenChange={setOpen}
        title="정말 삭제할까요?"
        description="삭제한 스토리는 복구할 수 없어요."
        onConfirm={onDelete}
      />
    </>
  )
}
