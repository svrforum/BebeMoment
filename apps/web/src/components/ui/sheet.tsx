'use client'
import dynamic from 'next/dynamic'
import { type SheetBackState, reduceSheetOpenChange, reduceSheetPopState } from '@/lib/sheet-back'
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
 * 시트가 열려 있는 동안 뒤로가기는 시트만 닫는다(`lib/sheet-back.ts`). 히스토리에 태울 때
 * **Next 의 현재 state 를 그대로 재사용**한다 — 임의의 state 를 넣으면 App Router 가 popstate 를
 * 자기 항목으로 못 알아보고 전체 새로고침을 할 수 있다. URL 도 바꾸지 않는다.
 */
function useSheetBack(open: boolean, onOpenChange: (open: boolean) => void): void {
  const state = useRef<SheetBackState>({ pushed: false, length: 0, href: '', navigating: false })
  const close = useRef(onOpenChange)
  close.current = onOpenChange

  useEffect(() => {
    const now = { length: window.history.length, href: location.href }
    const action = reduceSheetOpenChange(state.current, open, now)
    if (action === 'push') {
      window.history.pushState(window.history.state, '', location.href)
      state.current.length = window.history.length
    } else if (action === 'back') {
      window.history.back()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPopState = () => {
      if (reduceSheetPopState(state.current, true) === 'close') close.current(false)
    }
    // 시트 안의 링크가 다른 주소로 가면 닫힘이 그 이동을 되돌리지 않게 미리 표시한다.
    const onClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null
      const anchor = target?.closest('a[href]')
      if (!anchor || !anchor.closest('[data-vaul-drawer], [role="dialog"]')) return
      const to = new URL(anchor.getAttribute('href') ?? '', location.href)
      if (to.href !== location.href) state.current.navigating = true
    }
    window.addEventListener('popstate', onPopState)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('popstate', onPopState)
      document.removeEventListener('click', onClick, true)
    }
  }, [open])
}
