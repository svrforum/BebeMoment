'use client'
import { FAB } from '@/components/shell/fab'
import { Sheet, useIsDesktop } from '@/components/ui/sheet'
import { ToastProvider, ToastViewport } from '@/components/ui/toast'
import { useUploadManager } from '@/components/upload/upload-manager'
import { UploadSheetProvider, useUploadSheet } from '@/components/upload/upload-sheet'
import { FamilySSEProvider } from '@/lib/sse'
import { ToastEmitterProvider } from '@/lib/toast'
import type { Capability } from '@bebe/core'
import { FolderOpen, ImagePlus, PencilLine, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { usePathname, useRouter } from 'next/navigation'
import { type ChangeEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

// FAB shows only on pages where adding content from the library makes sense.
// Hidden on content creation / edit / detail screens to avoid confusion.
// 스토리에는 자체 '쓰기' 액션이 있어 업로드 FAB 를 띄우지 않는다(중복·혼동 방지).
const FAB_ROUTES = ['/timeline', '/calendar', '/saved', '/babies', '/trash']

function FabTrigger({
  canUpload,
  canCreateStory,
}: {
  canUpload: boolean
  canCreateStory: boolean
}) {
  const t = useTranslations('shell')
  const { open } = useUploadSheet()
  const { addFiles } = useUploadManager()
  const isDesktop = useIsDesktop()
  const pathname = usePathname()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const anyInputRef = useRef<HTMLInputElement>(null)
  const [chooserOpen, setChooserOpen] = useState(false)

  // 모바일: + 누르면 OS 갤러리 바로 열기(중간 "파일 선택" 시트 생략) → 고르면
  // 미리보기 시트. 데스크탑: 드래그앤드롭 가능한 시트를 연다.
  const onUpload = useCallback(() => {
    if (isDesktop) open()
    else inputRef.current?.click()
  }, [isDesktop, open])

  // 스토리 컴포저는 타임라인 최상단에 있고 `#composer` 해시로 펼친다. 다른 라우트에선
  // /timeline#composer 로 이동(컴포저 mount 효과가 펼침), 이미 타임라인이면 커스텀
  // 이벤트로 펼친다(해시가 이미 #composer 로 남아 hashchange 가 안 뜨는 경우 대비).
  const goStory = useCallback(() => {
    if (pathname === '/timeline') {
      if (window.location.hash !== '#composer') window.location.hash = 'composer'
      window.dispatchEvent(new Event('bebe:open-composer'))
    } else {
      router.push('/timeline#composer')
    }
  }, [pathname, router])

  // OS 사진 선택기는 갤러리가 색인한 것만 보여준다 — 카메라가 남긴 파일(A6700 XAVC 등)은
  // 목록에 아예 없어서 고를 방법이 없었다. accept 를 비운 입력은 문서 선택기를 열어
  // 그런 파일까지 닿게 한다.
  const onUploadFiles = useCallback(() => {
    anyInputRef.current?.click()
  }, [])

  // 업로드가 가능하면 항상 선택 시트를 띄운다 — 예전처럼 곧장 사진 선택기를 열면
  // "파일에서 선택" 이 어디에도 보이지 않아 존재를 알 수 없다.
  const onPress = useCallback(() => {
    if (!canUpload) return goStory()
    // 데스크탑 단독 업로드는 시트(드래그앤드롭)에 두 진입점이 다 있어 한 단계 생략.
    if (isDesktop && !canCreateStory) return open()
    setChooserOpen(true)
  }, [canUpload, canCreateStory, goStory, isDesktop, open])

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
  const both = canUpload && canCreateStory
  const fabIcon = both ? Plus : canUpload ? ImagePlus : PencilLine
  const fabLabel = both ? t('addFab') : canUpload ? t('uploadFab') : t('addStory')
  return (
    <>
      <FAB onPress={onPress} label={fabLabel} icon={fabIcon} />
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={onPick}
        className="hidden"
      />
      <input ref={anyInputRef} type="file" multiple onChange={onPick} className="hidden" />
      {canUpload && (
        <Sheet open={chooserOpen} onOpenChange={setChooserOpen} title={t('addTitle')}>
          <div className="flex flex-col gap-2 px-4 pb-4">
            {canCreateStory && (
              <ChooserRow
                icon={<PencilLine size={20} strokeWidth={2} />}
                title={t('addStory')}
                desc={t('addStoryDesc')}
                onClick={() => {
                  setChooserOpen(false)
                  goStory()
                }}
              />
            )}
            <ChooserRow
              icon={<ImagePlus size={20} strokeWidth={2} />}
              title={t('addUpload')}
              desc={t('addUploadDesc')}
              onClick={() => {
                setChooserOpen(false)
                onUpload()
              }}
            />
            <ChooserRow
              icon={<FolderOpen size={20} strokeWidth={2} />}
              title={t('addFiles')}
              desc={t('addFilesDesc')}
              onClick={() => {
                setChooserOpen(false)
                onUploadFiles()
              }}
            />
          </div>
        </Sheet>
      )}
    </>
  )
}

function ChooserRow({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: ReactNode
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-4 rounded-2xl border border-base-200/70 bg-base-0 p-4 text-left transition-colors ease-ios hover:bg-base-100/70 active:scale-[0.99] dark:border-base-800/70 dark:bg-base-900 dark:hover:bg-base-800/50"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-point-500/12 text-point-500">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold text-base-900 dark:text-base-50">{title}</div>
        <div className="mt-0.5 text-[12px] text-base-500">{desc}</div>
      </div>
    </button>
  )
}

export function AppShellClient({
  children,
  capabilities,
  canCreateStory,
  storyBabyId,
}: {
  children: ReactNode
  capabilities: Capability[]
  canCreateStory: boolean
  storyBabyId: string | null
}) {
  // FAB adds content. Upload is the base action (a story requires attaching a
  // photo, which itself needs asset.upload), so the FAB is gated on upload.
  // When the viewer can also write stories, the FAB opens a story/upload
  // chooser instead of going straight to the picker.
  const canUpload = capabilities.includes('asset.upload')
  return (
    <ToastProvider swipeDirection="down">
      <ToastEmitterProvider>
        <FamilySSEProvider>
          <UploadSheetProvider canCreateStory={canCreateStory} storyBabyId={storyBabyId}>
            {children}
            {canUpload && <FabTrigger canUpload={canUpload} canCreateStory={canCreateStory} />}
          </UploadSheetProvider>
        </FamilySSEProvider>
      </ToastEmitterProvider>
      <ToastViewport />
    </ToastProvider>
  )
}
