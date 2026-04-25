'use client'
import { cn } from '@/lib/cn'
import { AnimatePresence, motion } from 'framer-motion'
import { type ReactNode, useEffect, useState } from 'react'
import { Drawer } from 'vaul'

type SheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string | undefined
  children: ReactNode
  className?: string | undefined
}

/**
 * Responsive sheet:
 *   - <md (mobile): vaul bottom drawer with grab handle
 *   - >=md (desktop): centered modal card with fade+scale transition
 *
 * Same controlled API in both modes so callers don't care which surface
 * they get. The desktop centered-modal feels more natural when there's
 * lots of horizontal real estate — bottom-sheets on a 1440-wide screen
 * are a strange affordance carried over from phones.
 */
export function Sheet({ open, onOpenChange, title, children, className }: SheetProps) {
  const isDesktop = useIsDesktop()

  // First render is always "mobile" to keep SSR/hydration deterministic;
  // we flip to desktop after mount if the viewport says so.
  if (!isDesktop) {
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
              <Drawer.Title className="px-5 pt-4 text-lg font-semibold">
                {title}
              </Drawer.Title>
            )}
            <div className="overflow-y-auto px-5 py-4">{children}</div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    )
  }

  return <DesktopModal open={open} onOpenChange={onOpenChange} title={title} className={className}>{children}</DesktopModal>
}

function DesktopModal({
  open,
  onOpenChange,
  title,
  children,
  className,
}: SheetProps) {
  // Esc to close.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  // Lock background scroll while open.
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

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return isDesktop
}
