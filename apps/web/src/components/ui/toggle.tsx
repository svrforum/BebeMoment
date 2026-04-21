'use client'
import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type ToggleProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  ({ className, checked, ...props }, ref) => (
    <label className="inline-flex items-center cursor-pointer">
      <input ref={ref} type="checkbox" className="sr-only peer" checked={checked} {...props} />
      <span
        className={cn(
          'relative w-12 h-7 rounded-full bg-base-300 dark:bg-base-700 transition-colors ease-ios',
          'peer-checked:bg-point-500',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-point-500 peer-focus-visible:ring-offset-2',
          className,
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ease-ios',
            checked && 'translate-x-5',
          )}
        />
      </span>
    </label>
  ),
)
Toggle.displayName = 'Toggle'
