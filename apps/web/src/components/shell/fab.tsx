'use client'
import { cn } from '@/lib/cn'
import { ImagePlus, type LucideIcon } from 'lucide-react'

type Props = {
  onPress: () => void
  label: string
  icon?: LucideIcon
  className?: string
}

/**
 * Floating action button. The caller decides the action: a single-capability
 * viewer gets a one-tap upload / story button, while a viewer who can do both
 * gets a chooser sheet (see FabTrigger). Icon + label are passed in so the same
 * button serves all three cases.
 *
 * Uses plain CSS active:scale rather than framer-motion so the lib doesn't
 * land in the always-rendered app shell bundle.
 */
export function FAB({ onPress, label, icon: Icon = ImagePlus, className }: Props) {
  return (
    <div className={cn('fixed bottom-20 right-4 z-30 md:bottom-8', className)}>
      <button
        type="button"
        onClick={onPress}
        aria-label={label}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-point-500 text-white shadow-elevated transition-all duration-150 ease-out hover:bg-point-600 active:scale-[0.92]"
      >
        <Icon className="h-6 w-6" strokeWidth={2.5} />
      </button>
    </div>
  )
}
