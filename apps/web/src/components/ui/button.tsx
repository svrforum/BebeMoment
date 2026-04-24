import { cn } from '@/lib/cn'
import { Slot } from '@radix-ui/react-slot'
import { type VariantProps, cva } from 'class-variance-authority'
import { type ButtonHTMLAttributes, forwardRef } from 'react'

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold',
    'transition-all duration-200 ease-out',
    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-point-500/25',
    'disabled:opacity-40 disabled:pointer-events-none',
    'active:scale-[0.98]',
  ].join(' '),
  {
    variants: {
      variant: {
        primary:
          'bg-point-500 text-white shadow-[0_6px_20px_-6px] shadow-point-500/45 hover:bg-point-600 hover:shadow-point-500/55',
        secondary:
          'bg-base-100 text-base-900 hover:bg-base-200 dark:bg-base-800 dark:text-base-100 dark:hover:bg-base-700',
        ghost: 'text-base-700 hover:bg-base-100 dark:text-base-300 dark:hover:bg-base-800',
        danger:
          'bg-danger text-white shadow-[0_6px_20px_-6px] shadow-danger/40 hover:brightness-110',
      },
      size: {
        sm: 'h-9 px-4 text-sm',
        md: 'h-11 px-5 text-base',
        lg: 'h-14 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />
    )
  },
)
Button.displayName = 'Button'

export { buttonVariants }
