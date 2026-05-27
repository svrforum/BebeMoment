'use client'
import { Sheet } from '@/components/ui/sheet'
import dynamic from 'next/dynamic'
import { type ReactNode, createContext, useContext, useMemo, useState } from 'react'
import { UploadManagerProvider } from './upload-manager'
import { UploadStatusPill } from './upload-status-pill'

const LazyUploadDashboard = dynamic(
  () => import('./upload-dashboard').then((m) => ({ default: m.UploadDashboard })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[380px] items-center justify-center text-sm text-base-500">
        업로더 준비 중…
      </div>
    ),
  },
)

type UploadSheetContextType = {
  open: () => void
  close: () => void
}

const UploadSheetContext = createContext<UploadSheetContextType | null>(null)

export function useUploadSheet(): UploadSheetContextType {
  const ctx = useContext(UploadSheetContext)
  if (!ctx) throw new Error('useUploadSheet must be inside UploadSheetProvider')
  return ctx
}

export function UploadSheetProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false)

  const value = useMemo(() => ({ open: () => setOpen(true), close: () => setOpen(false) }), [])

  return (
    <UploadManagerProvider>
      <UploadSheetContext.Provider value={value}>
        {children}
        <Sheet open={isOpen} onOpenChange={setOpen} title="사진 · 영상 올리기">
          {isOpen && <LazyUploadDashboard />}
        </Sheet>
        <UploadStatusPill onClick={() => setOpen(true)} />
      </UploadSheetContext.Provider>
    </UploadManagerProvider>
  )
}
