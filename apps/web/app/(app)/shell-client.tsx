'use client'
import { FAB } from '@/components/shell/fab'
import { ToastProvider, ToastViewport } from '@/components/ui/toast'
import { UploadSheetProvider, useUploadSheet } from '@/components/upload/upload-sheet'
import { ToastEmitterProvider } from '@/lib/toast'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

// FAB shows only on pages where adding content from the library makes sense.
// Hidden on content creation / edit / detail screens to avoid confusion.
const FAB_ROUTES = ['/timeline', '/calendar', '/saved', '/journal', '/babies', '/trash']

function FabTrigger() {
  const { open } = useUploadSheet()
  const pathname = usePathname()
  const show = FAB_ROUTES.some((r) => pathname === r)
  if (!show) return null
  return <FAB onUpload={open} />
}

export function AppShellClient({ children }: { children: ReactNode }) {
  return (
    <ToastProvider swipeDirection="down">
      <ToastEmitterProvider>
        <UploadSheetProvider>
          {children}
          <FabTrigger />
        </UploadSheetProvider>
      </ToastEmitterProvider>
      <ToastViewport />
    </ToastProvider>
  )
}
