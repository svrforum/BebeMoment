import { cn } from '@/lib/cn'
import type { HTMLAttributes } from 'react'

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('shimmer rounded-xl bg-base-200/80 dark:bg-base-800/80', className)}
      {...props}
    />
  )
}
