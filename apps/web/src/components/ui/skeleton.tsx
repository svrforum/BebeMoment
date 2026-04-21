import { cn } from '@/lib/cn'
import type { HTMLAttributes } from 'react'

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-xl bg-base-200 dark:bg-base-800', className)}
      {...props}
    />
  )
}
