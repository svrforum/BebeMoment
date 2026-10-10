'use client'
import dynamic from 'next/dynamic'
import { useBackLayer } from '@/components/shell/back-layer'
import { type ReactNode, useEffect, useState } from 'react'

type SheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string | undefined
  children: ReactNode
  className?: string | undefined
  /**
   * Fixed-height column layout: the shell stops wrapping children in its own
   * scroll container so children can own internal scroll regions (e.g. a
   * scrollable list + a pinned footer). Used by the comment sheet for a
   * fixed header / scrolling list / fixed composer.
   */
  fill?: boolean | undefined
}

/**
 * Sheet is open-on-demand. The actual surface (vaul Drawer for mobile,
 * framer-motion modal for desktop) lives in a separate chunk loaded only
 * when `open` flips true the first time. Closed sheets render nothing —
 * keeping vaul + framer-motion out of the app shell bundle.
 */

const MobileDrawer = dynamic(
  () => import('./sheet-shells').then((m) => ({ default: m.MobileDrawerShell })),
  { ssr: false },
)

const DesktopModal = dynamic(
  () => import('./sheet-shells').then((m) => ({ default: m.DesktopModalShell })),
  { ssr: false },
)

export function Sheet({ open, onOpenChange, title, children, className, fill }: SheetProps) {
  const isDesktop = useIsDesktop()
  // 열려 있는 동안 뒤로가기는 페이지를 떠나는 대신 시트를 닫는다(`lib/back-layers.ts`).
  useBackLayer('sheet', open, () => onOpenChange(false))

  // Don't even mount the heavy surface until the user opens the sheet at
  // least once. Cheap re-renders, big bundle-size savings on shells that
  // get used rarely.
  const [hasOpened, setHasOpened] = useState(false)
  useEffect(() => {
    if (open && !hasOpened) setHasOpened(true)
  }, [open, hasOpened])
  if (!hasOpened) return null

  if (isDesktop) {
    return (
      <DesktopModal
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        className={className}
        fill={fill}
      >
        {children}
      </DesktopModal>
    )
  }
  return (
    <MobileDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      className={className}
      fill={fill}
    >
      {children}
    </MobileDrawer>
  )
}

export function useIsDesktop(): boolean {
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
