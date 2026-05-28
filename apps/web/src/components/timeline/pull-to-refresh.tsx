'use client'

import { RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

const PULL_THRESHOLD = 70 // px — release-past triggers refresh
const MAX_PULL = 120 // visual cap (rubber-band)
const DAMP = 0.5 // resistance — pulling 100px shows 50px

/**
 * Window-scoped pull-to-refresh. Mount once on a page (the timeline) and it
 * listens at the document for a top-of-page downward drag.
 *
 * Imperative DOM writes via refs so the indicator follows the finger without
 * re-rendering the whole page on each touchmove. React state is used only for
 * the refreshing → reset boundary.
 */
export function PullToRefresh(): React.JSX.Element {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const iconRef = useRef<HTMLDivElement>(null)
  const startY = useRef(0)
  const distance = useRef(0)
  const active = useRef(false)

  useEffect(() => {
    function setVisual(d: number, transition: boolean): void {
      const el = indicatorRef.current
      const ic = iconRef.current
      if (!el || !ic) return
      const damped = Math.min(MAX_PULL, d * DAMP)
      const opacity = Math.min(1, damped / PULL_THRESHOLD)
      const rotate = (damped / PULL_THRESHOLD) * 360
      el.style.transition = transition ? 'transform 220ms ease-out, opacity 220ms ease-out' : 'none'
      el.style.transform = `translateY(${damped - 56}px)`
      el.style.opacity = String(opacity)
      ic.style.transform = `rotate(${rotate}deg)`
    }

    function onStart(e: TouchEvent): void {
      // Only when at the very top — otherwise let scrolling work normally.
      if (window.scrollY > 0) {
        active.current = false
        return
      }
      const t = e.touches[0]
      if (!t || e.touches.length > 1) return
      startY.current = t.clientY
      distance.current = 0
      active.current = true
      setVisual(0, false)
    }

    function onMove(e: TouchEvent): void {
      if (!active.current) return
      if (window.scrollY > 0) {
        active.current = false
        setVisual(0, true)
        return
      }
      const t = e.touches[0]
      if (!t) return
      const dy = t.clientY - startY.current
      if (dy <= 0) {
        // dragging up — let it through (and reset our indicator).
        if (distance.current !== 0) {
          distance.current = 0
          setVisual(0, false)
        }
        return
      }
      distance.current = dy
      setVisual(dy, false)
    }

    async function onEnd(): Promise<void> {
      if (!active.current) {
        return
      }
      active.current = false
      const damped = Math.min(MAX_PULL, distance.current * DAMP)
      if (damped >= PULL_THRESHOLD && !refreshing) {
        // Past threshold — hold the indicator visible while refreshing, then reset.
        setRefreshing(true)
        const el = indicatorRef.current
        if (el) {
          el.style.transition = 'transform 180ms ease-out, opacity 180ms ease-out'
          el.style.transform = `translateY(${PULL_THRESHOLD - 56}px)`
          el.style.opacity = '1'
        }
        try {
          router.refresh()
          await new Promise((r) => setTimeout(r, 700))
        } finally {
          setRefreshing(false)
          distance.current = 0
          setVisual(0, true)
        }
      } else {
        distance.current = 0
        setVisual(0, true)
      }
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [router, refreshing])

  return (
    <div
      ref={indicatorRef}
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center"
      style={{ transform: 'translateY(-56px)', opacity: 0 }}
    >
      <div
        ref={iconRef}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-base-0 shadow-md ring-1 ring-base-200 dark:bg-base-900 dark:ring-base-800"
      >
        <RefreshCw
          size={18}
          className={refreshing ? 'animate-spin text-point-500' : 'text-base-500'}
        />
      </div>
    </div>
  )
}
