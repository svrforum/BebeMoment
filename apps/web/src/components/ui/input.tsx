import { cn } from '@/lib/cn'
import { type InputHTMLAttributes, type LabelHTMLAttributes, forwardRef } from 'react'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-12 w-full rounded-2xl border border-transparent bg-base-100 px-4 text-[15px] transition-all',
        'text-base-900 placeholder:text-base-400 dark:bg-base-800 dark:text-base-100',
        'hover:bg-base-200/60 dark:hover:bg-base-800/80',
        'focus-visible:border-point-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-point-500/15',
        'disabled:opacity-40',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    // biome-ignore lint/a11y/noLabelWithoutControl: htmlFor is supplied by consumers via props
    <label
      ref={ref}
      className={cn(
        'mb-2 block text-[13px] font-medium text-base-500 dark:text-base-400',
        className,
      )}
      {...props}
    />
  ),
)
Label.displayName = 'Label'
