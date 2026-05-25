'use client'
import { cn } from '@/lib/cn'
import { AnimatePresence, motion } from 'framer-motion'
import { type ReactNode, useEffect } from 'react'
import { Drawer } from 'vaul'

/**
 * Heavy shells split out so vaul + framer-motion only enter the bundle
 * when a Sheet has actually been opened. Imported via `next/dynamic` from
 * sheet.tsx so the initial app bundle stays light.
 */

export function MobileDrawerShell({
  open,
  onOpenChange,
  title,
  children,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string | undefined
  children: ReactNode
  className: string | undefined
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
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

export function DesktopModalShell({
  open,
  onOpenChange,
  title,
  children,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string | undefined
  children: ReactNode
  className: string | undefined
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            onClick={() => onOpenChange(false)}
            aria-hidden
          />
          {/* biome-ignore lint/a11y/useSemanticElements: custom framer-motion modal; native <dialog> conflicts with the overlay + spring animation setup */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 480, damping: 30 }}
            className={cn(
              'relative z-10 flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-base-200/70 bg-base-0 shadow-elevated dark:border-base-800/70 dark:bg-base-900',
              className,
            )}
          >
            {title && (
              <div className="border-b border-base-100 px-5 py-4 dark:border-base-800/60">
                <h2 className="text-[15px] font-semibold tracking-tight text-base-900 dark:text-base-50">
                  {title}
                </h2>
              </div>
            )}
            <div className="overflow-y-auto px-5 py-4">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
