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
import { type ChangeEvent, type ReactNode, useCallback, useEffect, useRef } from 'react'

// FAB shows only on pages where adding content from the library makes sense.
// Hidden on content creation / edit / detail screens to avoid confusion.
// 스토리에는 자체 '쓰기' 액션이 있어 업로드 FAB 를 띄우지 않는다(중복·혼동 방지).
const FAB_ROUTES = ['/timeline', '/calendar', '/saved', '/babies', '/trash']

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

  // 안드로이드 "갤러리 → 공유 → bebe" 가 네이티브에서 호출하는 훅. 공유 파일(data URL)을
  // File 로 만들어 기존 업로드 스테이징(미리보기·편집·최적화)으로 넣는다 — 바로 안 올리고
  // 사용자가 "업로드" 를 눌러야 시작. (이 effect 는 라우트 무관하게 등록됨)
  useEffect(() => {
    const w = window as unknown as {
      bebeReceiveSharedFiles?: (
        files: { name: string; type: string; url?: string; dataUrl?: string }[],
      ) => Promise<void>
    }
    w.bebeReceiveSharedFiles = async (files) => {
      try {
        const built: File[] = []
        for (const f of files ?? []) {
          // url = 앱이 WebView 요청 가로채기로 스트리밍 제공하는 same-origin 경로
          // (/__bebe_share/<id>) — 큰 영상도 메모리 폭증 없이. dataUrl 은 하위호환.
          const src = f.url ?? f.dataUrl
          if (!src) continue
          const blob = await (await fetch(src)).blob()
          built.push(new File([blob], f.name || 'shared', { type: f.type || blob.type }))
        }
        if (built.length === 0) return
        const ids = await addFiles(built)
        if (ids.length > 0) open()
      } catch {
        // 주입 실패 시 무시 — 사용자는 + 버튼으로 수동 업로드 가능.
      }
    }
    return () => {
      delete w.bebeReceiveSharedFiles
    }
  }, [addFiles, open])

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
