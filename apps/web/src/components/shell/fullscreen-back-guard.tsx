'use client'
import {
  type FullscreenBackState,
  reduceFullscreenChange,
  reducePopState,
} from '@/lib/fullscreen-back'
import { useEffect, useRef } from 'react'

type FullscreenDoc = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => void
}

/**
 * 영상 전체화면 중의 뒤로가기가 페이지를 떠나지 않게 한다. 상태 기계는
 * `lib/fullscreen-back.ts`, 여기서는 DOM·히스토리만 만진다.
 *
 * ⚠️ 히스토리에 태울 때 **Next 의 현재 state 객체를 그대로 재사용**한다. 임의의 state 를
 * 밀어 넣으면 App Router 가 popstate 에서 자기 항목으로 인식하지 못해 전체 새로고침을
 * 할 수 있다. URL 도 바꾸지 않으므로 라우트는 그대로다.
 */
export function FullscreenBackGuard(): null {
  const state = useRef<FullscreenBackState>({ pushed: false })

  useEffect(() => {
    const doc = document as FullscreenDoc
    const isFullscreen = () =>
      (doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null) !== null

    const onFullscreenChange = () => {
      const action = reduceFullscreenChange(state.current, isFullscreen())
      if (action === 'push') window.history.pushState(window.history.state, '', location.href)
      else if (action === 'back') window.history.back()
    }
    const onPopState = () => {
      if (reducePopState(state.current, isFullscreen()) !== 'exit') return
      if (doc.exitFullscreen) void doc.exitFullscreen().catch(() => {})
      else doc.webkitExitFullscreen?.()
    }

    doc.addEventListener('fullscreenchange', onFullscreenChange)
    doc.addEventListener('webkitfullscreenchange', onFullscreenChange)
    window.addEventListener('popstate', onPopState)
    return () => {
      doc.removeEventListener('fullscreenchange', onFullscreenChange)
      doc.removeEventListener('webkitfullscreenchange', onFullscreenChange)
      window.removeEventListener('popstate', onPopState)
    }
  }, [])

  return null
}
