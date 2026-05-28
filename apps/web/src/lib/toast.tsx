'use client'
import { Toast, ToastDescription, ToastTitle } from '@/components/ui/toast'
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react'

export type ToastVariant = 'default' | 'danger' | 'success'

type ToastItem = {
  id: number
  title: string
  description?: string
  variant: ToastVariant
}

type ToastInput = {
  title: string
  description?: string
  variant?: ToastVariant
}

const Ctx = createContext<((t: ToastInput) => void) | null>(null)

let counter = 0

export function ToastEmitterProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((t: ToastInput) => {
    counter += 1
    const id = counter
    const item: ToastItem = {
      id,
      title: t.title,
      ...(t.description !== undefined && { description: t.description }),
      variant: t.variant ?? 'default',
    }
    setItems((prev) => [...prev, item])
    setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id))
    }, 2200)
  }, [])

  const value = useMemo(() => push, [push])

  return (
    <Ctx.Provider value={value}>
      {children}
      {items.map((t) => (
        <Toast key={t.id} variant={t.variant}>
          <div className="flex flex-col gap-0.5">
            <ToastTitle className="text-sm font-semibold">{t.title}</ToastTitle>
            {t.description && (
              <ToastDescription className="text-xs opacity-90">{t.description}</ToastDescription>
            )}
          </div>
        </Toast>
      ))}
    </Ctx.Provider>
  )
}

export function useToast(): (t: ToastInput) => void {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast must be used within ToastEmitterProvider')
  return ctx
}
