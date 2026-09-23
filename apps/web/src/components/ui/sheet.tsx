'use client'
import dynamic from 'next/dynamic'
import { type SheetHistory, sheetClosed, sheetOpened, sheetPopState } from '@/lib/sheet-back'
import { type ReactNode, useEffect, useRef, useState } from 'react'

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
  useSheetBack(open, onOpenChange)

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

/**
 * 시트가 열려 있는 동안 뒤로가기는 시트만 닫는다(`lib/sheet-back.ts`). 모든 시트가 항목 하나를
 * 함께 쓰므로 상태와 popstate 리스너는 모듈에 하나만 둔다. 히스토리에 태울 때 **Next 의 현재
 * state 를 그대로 재사용**한다 — 임의의 state 를 넣으면 App Router 가 popstate 를 자기 항목으로
 * 못 알아보고 전체 새로고침을 할 수 있다. URL 도 바꾸지 않는다.
 */
const history: SheetHistory = { entry: 'none', href: '', open: 0 }
const openSheets = new Set<{ close: () => void }>()
let listening = false

function onPopState(): void {
  const action = sheetPopState(history, location.href)
  if (action === 'close-all') for (const sheet of [...openSheets]) sheet.close()
  else if (action === 'skip') window.history.back()
}

function useSheetBack(open: boolean, onOpenChange: (open: boolean) => void): void {
  const close = useRef(onOpenChange)
  close.current = onOpenChange

  useEffect(() => {
    if (!open) return
    if (!listening) {
      window.addEventListener('popstate', onPopState)
      listening = true
    }
    const me = { close: () => close.current(false) }
    openSheets.add(me)
    if (sheetOpened(history, location.href) === 'push')
      window.history.pushState(window.history.state, '', location.href)
    return () => {
      openSheets.delete(me)
      sheetClosed(history)
    }
  }, [open])
}
