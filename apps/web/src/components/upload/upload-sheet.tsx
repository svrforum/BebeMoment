'use client'
import { Sheet } from '@/components/ui/sheet'
import Uppy from '@uppy/core'
import '@uppy/core/css/style.css'
import '@uppy/dashboard/css/style.css'
import Dashboard from '@uppy/react/dashboard'
import Tus from '@uppy/tus'
import { useRouter } from 'next/navigation'
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react'

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
  const router = useRouter()
  const [isOpen, setOpen] = useState(false)

  const uppy = useMemo(
    () =>
      new Uppy({
        restrictions: {
          maxFileSize: 2 * 1024 * 1024 * 1024,
          allowedFileTypes: ['image/*', 'video/*'],
        },
        autoProceed: true,
      }).use(Tus, {
        endpoint: '/api/upload',
        chunkSize: 8 * 1024 * 1024,
        retryDelays: [0, 1000, 3000, 5000],
      }),
    [],
  )

  useEffect(() => {
    const handler = () => router.refresh()
    uppy.on('complete', handler)
    return () => {
      uppy.off('complete', handler)
      uppy.destroy()
    }
  }, [uppy, router])

  const value = useMemo(() => ({ open: () => setOpen(true), close: () => setOpen(false) }), [])

  return (
    <UploadSheetContext.Provider value={value}>
      {children}
      <Sheet open={isOpen} onOpenChange={setOpen} title="사진 · 영상 올리기">
        <Dashboard
          uppy={uppy}
          proudlyDisplayPoweredByUppy={false}
          height={380}
          hideUploadButton={false}
        />
      </Sheet>
    </UploadSheetContext.Provider>
  )
}
