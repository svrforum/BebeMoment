import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all ease-ios focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-point-500 focus-visible:ring-offset-2 focus-visible:ring-offset-base-0 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.97]',
  {
    variants: {
      variant: {
        primary: 'bg-point-500 text-white hover:bg-point-600',
        secondary: 'bg-base-100 text-base-900 hover:bg-base-200',
        ghost: 'text-base-700 hover:bg-base-100',
        danger: 'bg-danger text-white hover:opacity-90',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-4 text-base',
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
