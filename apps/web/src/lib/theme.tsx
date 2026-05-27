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
  defaultMode = 'auto',
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
      document.documentElement.classList.toggle('dark', r === 'dark')
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
