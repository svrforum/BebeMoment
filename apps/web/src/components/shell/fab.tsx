'use client'
import { cn } from '@/lib/cn'
import { Plus } from 'lucide-react'

type Props = {
  onClick: () => void
  className?: string
  label?: string
}

export function FAB({ onClick, className, label = '업로드' }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'fixed bottom-20 right-4 z-30 h-14 w-14 rounded-full bg-point-500 text-white shadow-elevated',
        'flex items-center justify-center transition-transform ease-ios active:scale-95',
        'hover:bg-point-600',
        className,
      )}
    >
      <Plus className="h-6 w-6" strokeWidth={2.5} />
    </button>
  )
}
