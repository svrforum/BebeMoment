'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { THEME_STORAGE_KEY as STORAGE_KEY } from './theme-init-script'

export type ThemeMode = 'auto' | 'light' | 'dark'

type ThemeCtx = {
  mode: ThemeMode
  resolved: 'light' | 'dark'
  setMode: (m: ThemeMode) => void
}

const Ctx = createContext<ThemeCtx | null>(null)

export function ThemeProvider({
  children,
  defaultMode = 'light',
}: {
  children: React.ReactNode
  /** Instance default set by the admin; user's localStorage choice overrides it. */
  defaultMode?: ThemeMode
}) {
  const [mode, setModeState] = useState<ThemeMode>(defaultMode)
  const [resolved, setResolved] = useState<'light' | 'dark'>('light')

  // User's stored preference overrides the admin default.
  useEffect(() => {
    const stored =
      typeof window !== 'undefined' ? (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) : null
    if (stored === 'light' || stored === 'dark' || stored === 'auto') {
      setModeState(stored)
    }
  }, [])

  // Apply + track resolved theme
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const r: 'light' | 'dark' = mode === 'auto' ? (mql.matches ? 'dark' : 'light') : mode
      setResolved(r)
      const root = document.documentElement
      if (root.classList.contains('dark') === (r === 'dark')) return
      // 클래스가 실제로 바뀔 때만 — 색 전환(transition-colors)이 한꺼번에 돌면 화면이 번지듯 바뀐다.
      // 두 프레임 동안 전환을 끄고 바꾼다.
      const freeze = document.createElement('style')
      freeze.append('*,*::before,*::after{transition:none!important}')
      document.head.append(freeze)
      root.classList.toggle('dark', r === 'dark')
      void root.offsetHeight
      requestAnimationFrame(() => requestAnimationFrame(() => freeze.remove()))
    }
    apply()
    if (mode === 'auto') {
      mql.addEventListener('change', apply)
      return () => mql.removeEventListener('change', apply)
    }
    return
  }, [mode])

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m)
    try {
      localStorage.setItem(STORAGE_KEY, m)
    } catch {}
  }, [])

  const value = useMemo<ThemeCtx>(() => ({ mode, resolved, setMode }), [mode, resolved, setMode])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme(): ThemeCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useTheme must be used inside ThemeProvider')
  return v
}
