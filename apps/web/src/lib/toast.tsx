'use client'
import { Toast, ToastClose, ToastDescription, ToastTitle } from '@/components/ui/toast'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
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

// 한꺼번에 실패가 쏟아져도(여러 장 업로드 등) 화면을 덮지 않게 최근 것만 남긴다.
const MAX_VISIBLE = 3
// 알림만 하는 토스트. 실패·액션 토스트는 시간이 지나도 사라지지 않는다 — 2.2초 뒤 지워지던
// 실패 문구와 6초 뒤 지워지던 '다시 시도' 는 읽기도 누르기도 전에 사라졌다(조용한 실패, §2#6).
const INFO_DURATION_MS = 4000
// 닫힘 애니메이션(toast-out 160ms)이 끝난 뒤 목록에서 뺀다.
const EXIT_MS = 200

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
    setItems((prev) => [...prev, item].slice(-MAX_VISIBLE))
  }, [])

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((x) => x.id !== id))
  }, [])
  const tc = useTranslations('common')

  const value = useMemo(() => push, [push])

  return (
    <Ctx.Provider value={value}>
      {children}
      {items.map((t) => {
        const sticky = t.variant === 'danger' || t.action !== undefined
        return (
          <Toast
            key={t.id}
            variant={t.variant}
            // 실패는 바로 읽어 주고(assertive), 나머지는 하던 말을 끊지 않는다(polite).
            type={t.variant === 'danger' ? 'foreground' : 'background'}
            // 시간 제한은 Radix 가 잰다 — 포인터·포커스가 올라가 있거나 창이 가려지면 멈춘다.
            duration={sticky ? Number.POSITIVE_INFINITY : INFO_DURATION_MS}
            onOpenChange={(open) => {
              if (!open) setTimeout(() => dismiss(t.id), EXIT_MS)
            }}
          >
            <div className="flex w-full items-center gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <ToastTitle className="text-sm font-semibold">{t.title}</ToastTitle>
                {t.description && (
                  <ToastDescription className="text-xs opacity-90">
                    {t.description}
                  </ToastDescription>
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
              {sticky && (
                <ToastClose
                  aria-label={tc('close')}
                  className="-m-1 shrink-0 rounded-full p-1 opacity-80 hover:opacity-100"
                >
                  <X size={16} aria-hidden />
                </ToastClose>
              )}
            </div>
          </Toast>
        )
      })}
    </Ctx.Provider>
  )
}

export function useToast(): (t: ToastInput) => void {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast must be used within ToastEmitterProvider')
  return ctx
}
