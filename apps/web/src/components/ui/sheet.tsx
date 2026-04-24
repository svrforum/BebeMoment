'use client'
import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'
import { Drawer } from 'vaul'

type SheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  children: ReactNode
  className?: string
}

export function Sheet({ open, onOpenChange, title, children, className }: SheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Drawer.Content
          className={cn(
            'fixed bottom-0 left-0 right-0 z-50 mt-24 flex max-h-[90vh] flex-col overflow-hidden rounded-t-3xl border-t border-base-200 bg-base-0 dark:border-base-800 dark:bg-base-900',
            className,
          )}
        >
          <div
            className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-base-300 dark:bg-base-700"
            aria-hidden
          />
          {title && (
            <Drawer.Title className="px-5 pt-4 text-lg font-semibold">{title}</Drawer.Title>
          )}
          <div className="overflow-y-auto px-5 py-4">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
