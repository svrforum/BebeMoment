'use client'
import { FAB } from '@/components/shell/fab'
import { ToastProvider, ToastViewport } from '@/components/ui/toast'
import { UploadSheetProvider, useUploadSheet } from '@/components/upload/upload-sheet'
import type { ReactNode } from 'react'

function FabTrigger() {
  const { open } = useUploadSheet()
  return <FAB onClick={open} />
}

export function AppShellClient({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <UploadSheetProvider>
        {children}
        <FabTrigger />
        <ToastViewport />
      </UploadSheetProvider>
    </ToastProvider>
  )
}
