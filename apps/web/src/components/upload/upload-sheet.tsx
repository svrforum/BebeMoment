'use client'
import { Sheet } from '@/components/ui/sheet'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react'
import { UploadManagerProvider, useUploadManager } from './upload-manager'
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

export function UploadSheetProvider({
  children,
  canCreateStory = false,
  storyBabyId = null,
}: {
  children: ReactNode
  canCreateStory?: boolean
  storyBabyId?: string | null
}) {
  return (
    <UploadManagerProvider>
      <UploadSheetInner canCreateStory={canCreateStory} storyBabyId={storyBabyId}>
        {children}
      </UploadSheetInner>
    </UploadManagerProvider>
  )
}

function UploadSheetInner({
  children,
  canCreateStory,
  storyBabyId,
}: {
  children: ReactNode
  canCreateStory: boolean
  storyBabyId: string | null
}) {
  const [isOpen, setOpen] = useState(false)
  const t = useTranslations('upload')
  const { clearStaged } = useUploadManager()

  // 시트를 닫으면(취소·드래그 dismiss 포함) 아직 시작 안 한 staged 파일을 비운다 —
  // 그대로 두면 같은 사진 재선택이 Uppy noDuplicates 로 막혔다. 진행 중 업로드는 보존.
  const close = useCallback(() => {
    setOpen(false)
    clearStaged()
  }, [clearStaged])
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) setOpen(true)
      else close()
    },
    [close],
  )

  const value = useMemo(() => ({ open: () => setOpen(true), close }), [close])

  return (
    <UploadSheetContext.Provider value={value}>
      {children}
      <Sheet open={isOpen} onOpenChange={handleOpenChange} title={t('sheetTitle')}>
        {isOpen && (
          <LazyUploadDashboard canCreateStory={canCreateStory} storyBabyId={storyBabyId} />
        )}
      </Sheet>
      <UploadStatusPill onClick={() => setOpen(true)} />
    </UploadSheetContext.Provider>
  )
}
