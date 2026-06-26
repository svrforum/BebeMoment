'use client'
import { cn } from '@/lib/cn'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { type ReactNode, useEffect, useRef } from 'react'
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
  fill,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string | undefined
  children: ReactNode
  className: string | undefined
  fill: boolean | undefined
}) {
  const t = useTranslations('common')
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Drawer.Content
          // 제목 없는 시트도 Radix Dialog 설명 경고를 피한다(설명 없음 명시).
          aria-describedby={undefined}
          className={cn(
            'fixed bottom-0 left-0 right-0 z-50 mt-24 flex flex-col overflow-hidden rounded-t-3xl border-t border-base-200 bg-base-0 dark:border-base-800 dark:bg-base-900',
            // Fill mode wants a definite height so the inner flex column
            // (scroll region + pinned footer) can resolve flex-1. Otherwise
            // size to content, capped at 90vh.
            fill ? 'h-[85dvh] max-h-[85dvh]' : 'max-h-[90vh]',
            className,
          )}
        >
          <div
            className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-base-300 dark:bg-base-700"
            aria-hidden
          />
          {/* Drawer.Title 은 항상 렌더 — 없으면 스크린리더용 sr-only 폴백(접근성 위반 방지). */}
          <Drawer.Title
            className={title ? 'shrink-0 px-5 pt-4 pb-1 text-lg font-semibold' : 'sr-only'}
          >
            {title ?? t('dialog')}
          </Drawer.Title>
          {fill ? (
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          ) : (
            <div className="overflow-y-auto px-5 py-4">{children}</div>
          )}
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
  fill,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string | undefined
  children: ReactNode
  className: string | undefined
  fill: boolean | undefined
}) {
  const t = useTranslations('common')
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  // 포커스 트랩 — 열릴 때 다이얼로그로 포커스 이동, Tab 을 다이얼로그 내부로 가두고,
  // 닫힐 때 이전 포커스 복원(키보드/스크린리더 사용자가 모달 밖으로 새지 않게).
  useEffect(() => {
    if (!open) return
    const prevFocus = document.activeElement as HTMLElement | null
    const node = dialogRef.current
    node?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !node) return
      const items = node.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
      )
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0] as HTMLElement
      const last = items[items.length - 1] as HTMLElement
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      prevFocus?.focus?.()
    }
  }, [open])

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
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={title ?? t('dialog')}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 480, damping: 30 }}
            className={cn(
              'relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-base-200/70 bg-base-0 shadow-elevated dark:border-base-800/70 dark:bg-base-900',
              fill ? 'h-[80vh] max-h-[80vh]' : 'max-h-[80vh]',
              className,
            )}
          >
            {title && (
              <div className="shrink-0 border-b border-base-100 px-5 py-4 dark:border-base-800/60">
                <h2 className="text-[15px] font-semibold tracking-tight text-base-900 dark:text-base-50">
                  {title}
                </h2>
              </div>
            )}
            {fill ? (
              <div className="flex min-h-0 flex-1 flex-col">{children}</div>
            ) : (
              <div className="overflow-y-auto px-5 py-4">{children}</div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
