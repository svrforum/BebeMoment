import { cn } from '@/lib/cn'
import { type InputHTMLAttributes, type LabelHTMLAttributes, forwardRef } from 'react'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-xl bg-base-0 border border-base-200 dark:border-base-800 px-4 text-base',
        'placeholder:text-base-400',
        'focus-visible:outline-none focus-visible:border-point-500 focus-visible:ring-2 focus-visible:ring-point-500/20',
        'disabled:opacity-50 disabled:bg-base-100',
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
      className={cn('block text-sm font-medium text-base-700 dark:text-base-300 mb-1.5', className)}
      {...props}
    />
  ),
)
Label.displayName = 'Label'
