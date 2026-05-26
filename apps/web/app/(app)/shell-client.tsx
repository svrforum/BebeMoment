'use client'
import { FAB } from '@/components/shell/fab'
import { ToastProvider, ToastViewport } from '@/components/ui/toast'
import { UploadSheetProvider, useUploadSheet } from '@/components/upload/upload-sheet'
import { FamilySSEProvider } from '@/lib/sse'
import { ToastEmitterProvider } from '@/lib/toast'
import type { Capability } from '@bebe/core'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

// FAB shows only on pages where adding content from the library makes sense.
// Hidden on content creation / edit / detail screens to avoid confusion.
const FAB_ROUTES = ['/timeline', '/calendar', '/saved', '/diary', '/babies', '/trash']

function FabTrigger() {
  const { open } = useUploadSheet()
  const pathname = usePathname()
  const show = FAB_ROUTES.some((r) => pathname === r)
  if (!show) return null
  return <FAB onUpload={open} />
}

export function AppShellClient({
  children,
  capabilities,
}: {
  children: ReactNode
  capabilities: Capability[]
}) {
  // FAB is single-purpose (photo/video upload). Hide it entirely when the
  // viewer lacks upload permission — they can still comment/view.
  const canUpload = capabilities.includes('asset.upload')
  return (
    <ToastProvider swipeDirection="down">
      <ToastEmitterProvider>
        <FamilySSEProvider>
          <UploadSheetProvider>
            {children}
            {canUpload && <FabTrigger />}
          </UploadSheetProvider>
        </FamilySSEProvider>
      </ToastEmitterProvider>
      <ToastViewport />
    </ToastProvider>
  )
}
