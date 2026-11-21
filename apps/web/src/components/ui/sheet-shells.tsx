'use client'
import { cn } from '@/lib/cn'
import { keyboardOverlaysLayout } from '@/lib/keyboard-overlap'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
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
  label,
  children,
  className,
  fill,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string | undefined
  /** 보이는 제목이 없을 때 화면낭독기에 들려줄 이름. */
  label: string | undefined
  children: ReactNode
  className: string | undefined
  fill: boolean | undefined
}) {
  const t = useTranslations('common')
  const contentRef = useRef<HTMLDivElement>(null)

  // vaul 은 키보드가 화면을 **덮는다**고 보고 시트 높이·bottom 을 인라인 스타일로 직접 잡는다.
  // 레이아웃 뷰포트가 실제로 줄어드는 브라우저(뷰포트 interactive-widget=resizes-content,
  // 안드로이드 WebView 의 adjustResize)에서는 그 계산이 어긋나 키보드가 닫힌 뒤에도 줄어든
  // 높이가 남는다 — 시트가 반쪽으로 굳는다. 키보드가 덮고 있지 않은 동안에는 인라인 값을
  // 걷어내 CSS 상한(dvh)에 맡긴다.
  useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    if (!vv) return
    const releaseInlineSizing = () => {
      const node = contentRef.current
      if (!node) return
      if (keyboardOverlaysLayout(window.innerHeight, vv.height)) return
      node.style.height = ''
      node.style.bottom = ''
    }
    // 두 이벤트를 다 듣는다. 레이아웃이 줄어드는 브라우저에서는 visualViewport 만 듣다가
    // innerHeight 는 줄었는데 visualViewport 이벤트가 안 오는 프레임을 만나면, 잘못된 인라인
    // 높이가 다음 이벤트까지 남아 시트가 반쪽으로 굳는다.
    vv.addEventListener('resize', releaseInlineSizing)
    window.addEventListener('resize', releaseInlineSizing)
    return () => {
      vv.removeEventListener('resize', releaseInlineSizing)
      window.removeEventListener('resize', releaseInlineSizing)
    }
  }, [open])

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Drawer.Content
          ref={contentRef}
          // 제목 없는 시트도 Radix Dialog 설명 경고를 피한다(설명 없음 명시).
          aria-describedby={undefined}
          // vaul 은 기본으로 열릴 때 포커스를 옮기지 않아, 화면낭독기 포커스가 aria-hidden 된 뒤쪽
          // 트리거에 남고 시트가 열린 걸 알리지 않았다. 첫 입력칸 대신 시트 자체로 옮긴다 —
          // 입력칸으로 가면 모바일 키보드가 저절로 올라온다.
          tabIndex={-1}
          // 안쪽에 data-autofocus 가 있으면 그쪽(예: 삭제 확인의 취소 버튼)으로.
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            const node = contentRef.current
            const target = node?.querySelector<HTMLElement>('[data-autofocus]') ?? node
            target?.focus({ preventScroll: true })
          }}
          className={cn(
            'fixed bottom-0 left-0 right-0 z-50 mt-24 flex flex-col overflow-hidden rounded-t-3xl outline-none border-t border-base-200 bg-base-0 dark:border-base-800 dark:bg-base-900',
            // Fill mode wants a definite height so the inner flex column
            // (scroll region + pinned footer) can resolve flex-1. Otherwise
            // size to content, capped at 90dvh — dynamic units so the cap
            // follows the viewport the soft keyboard leaves behind.
            fill ? 'h-[85dvh] max-h-[85dvh]' : 'max-h-[90dvh]',
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
            {title ?? label ?? t('dialog')}
          </Drawer.Title>
          {fill ? (
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          ) : (
            <div className="overflow-y-auto overscroll-contain px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              {children}
            </div>
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
  label,
  children,
  className,
  fill,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string | undefined
  /** 보이는 제목이 없을 때 화면낭독기에 들려줄 이름. */
  label: string | undefined
  children: ReactNode
  className: string | undefined
  fill: boolean | undefined
}) {
  const t = useTranslations('common')
  const dialogRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (!open) return
    // 캡처 단계에서 먼저 받고 preventDefault — 뒤에 있는 뷰어의 Esc(뒤로가기)가 같이 돌지 않게.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      onOpenChange(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onOpenChange])

  // 포커스 트랩 — 열릴 때 다이얼로그로 포커스 이동, Tab 을 다이얼로그 내부로 가두고,
  // 닫힐 때 이전 포커스 복원(키보드/스크린리더 사용자가 모달 밖으로 새지 않게).
  useEffect(() => {
    if (!open) return
    const prevFocus = document.activeElement as HTMLElement | null
    const node = dialogRef.current
    ;(node?.querySelector<HTMLElement>('[data-autofocus]') ?? node)?.focus()
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

  // 동작 줄이기면 커지며 떠오르는 대신 투명도만 바꾼다.
  const hidden = reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }

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
            aria-label={title ?? label ?? t('dialog')}
            tabIndex={-1}
            initial={hidden}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={hidden}
            transition={{ type: 'spring', stiffness: 480, damping: 30 }}
            className={cn(
              'relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-base-200/70 bg-base-0 shadow-elevated dark:border-base-800/70 dark:bg-base-900',
              fill ? 'h-[80dvh] max-h-[80dvh]' : 'max-h-[80dvh]',
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
              <div className="overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
