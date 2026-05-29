'use client'
import { FAB } from '@/components/shell/fab'
import { useIsDesktop } from '@/components/ui/sheet'
import { ToastProvider, ToastViewport } from '@/components/ui/toast'
import { useUploadManager } from '@/components/upload/upload-manager'
import { UploadSheetProvider, useUploadSheet } from '@/components/upload/upload-sheet'
import { FamilySSEProvider } from '@/lib/sse'
import { ToastEmitterProvider } from '@/lib/toast'
import type { Capability } from '@bebe/core'
import { usePathname } from 'next/navigation'
import { type ChangeEvent, type ReactNode, useCallback, useRef } from 'react'

// FAB shows only on pages where adding content from the library makes sense.
// Hidden on content creation / edit / detail screens to avoid confusion.
const FAB_ROUTES = ['/timeline', '/calendar', '/saved', '/story', '/babies', '/trash']

function FabTrigger() {
  const { open } = useUploadSheet()
  const { addFiles } = useUploadManager()
  const isDesktop = useIsDesktop()
  const pathname = usePathname()
  const inputRef = useRef<HTMLInputElement>(null)

  // 모바일: + 누르면 OS 갤러리 바로 열기(중간 "파일 선택" 시트 생략) → 고르면
  // 미리보기 시트. 데스크탑: 드래그앤드롭 가능한 시트를 연다.
  const onUpload = useCallback(() => {
    if (isDesktop) open()
    else inputRef.current?.click()
  }, [isDesktop, open])

  const onPick = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files
      // FileList 는 input 에 라이브 바인딩 — value='' 로 비우기 전에 먼저 스냅샷.
      // (먼저 비우면 list.length 가 0 이 돼 미리보기 시트가 안 열렸다.)
      const picked = list ? Array.from(list) : []
      e.target.value = ''
      if (picked.length === 0) return
      const ids = await addFiles(picked)
      if (ids.length > 0) open() // 미리보기 그리드 표시(스테이징됨, 아직 업로드 전)
    },
    [addFiles, open],
  )

  const show = FAB_ROUTES.some((r) => pathname === r)
  if (!show) return null
  return (
    <>
      <FAB onUpload={onUpload} />
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={onPick}
        className="hidden"
      />
    </>
  )
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
