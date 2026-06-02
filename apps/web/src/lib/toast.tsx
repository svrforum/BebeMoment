'use client'
import { Toast, ToastDescription, ToastTitle } from '@/components/ui/toast'
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react'

export type ToastVariant = 'default' | 'danger' | 'success'

export type ToastActionInput = { label: string; onClick: () => void }

type ToastItem = {
  id: number
  title: string
  description?: string
  variant: ToastVariant
  action?: ToastActionInput
}

type ToastInput = {
  title: string
  description?: string
  variant?: ToastVariant
  /** 선택 액션 버튼(예: 실패 토스트의 "다시 시도"). 있으면 표시 시간이 길어진다. */
  action?: ToastActionInput
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
      ...(t.action ? { action: t.action } : {}),
    }
    setItems((prev) => [...prev, item])
    // 액션이 있으면 탭할 시간을 더 준다.
    setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), t.action ? 6000 : 2200)
  }, [])

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((x) => x.id !== id))
  }, [])

  const value = useMemo(() => push, [push])

  return (
    <Ctx.Provider value={value}>
      {children}
      {items.map((t) => (
        <Toast key={t.id} variant={t.variant}>
          <div className="flex w-full items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <ToastTitle className="text-sm font-semibold">{t.title}</ToastTitle>
              {t.description && (
                <ToastDescription className="text-xs opacity-90">{t.description}</ToastDescription>
              )}
            </div>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick()
                  dismiss(t.id)
                }}
                className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold hover:bg-white/25"
              >
                {t.action.label}
              </button>
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
