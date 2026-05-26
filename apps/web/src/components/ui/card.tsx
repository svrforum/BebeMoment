import { cn } from '@/lib/cn'
import { type HTMLAttributes, forwardRef } from 'react'

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Opt-in hover-lift + press feedback for clickable cards. Leave off
   *  for static content surfaces (settings, account). */
  interactive?: boolean
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, interactive = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-2xl border border-base-200/70 bg-base-0 shadow-card dark:border-base-800/70 dark:bg-base-900',
        interactive &&
          'transition-[transform,box-shadow] duration-200 ease-ios hover:-translate-y-0.5 hover:shadow-elevated active:translate-y-0 active:shadow-card motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        className,
      )}
      {...props}
    />
  ),
)
Card.displayName = 'Card'

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-5 pb-2', className)} {...props} />
  ),
)
CardHeader.displayName = 'CardHeader'

export const CardBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-5', className)} {...props} />,
)
CardBody.displayName = 'CardBody'
