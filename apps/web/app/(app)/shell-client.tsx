'use client'
import { FAB } from '@/components/shell/fab'
import { FullscreenBackGuard } from '@/components/shell/fullscreen-back-guard'
import {
  type ScheduleBabyOption,
  ScheduleFormProvider,
  useScheduleForm,
} from '@/components/schedule/entry-form-sheet'
import { Sheet, useIsDesktop } from '@/components/ui/sheet'
import { ToastProvider, ToastViewport } from '@/components/ui/toast'
import { useUploadManager } from '@/components/upload/upload-manager'
import { UploadSheetProvider, useUploadSheet } from '@/components/upload/upload-sheet'
import { useFeatures } from '@/lib/features'
import { FamilySSEProvider } from '@/lib/sse'
import { ToastEmitterProvider } from '@/lib/toast'
import type { Capability } from '@bebe/core'
import { CalendarPlus, FolderOpen, ImagePlus, PencilLine, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { usePathname, useRouter } from 'next/navigation'
import { type ChangeEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

// FAB shows only on pages where adding content from the library makes sense.
// Hidden on content creation / edit / detail screens to avoid confusion.
// 스토리에는 자체 '쓰기' 액션이 있어 업로드 FAB 를 띄우지 않는다(중복·혼동 방지).
const FAB_ROUTES = ['/timeline', '/calendar', '/calendar/todo', '/saved', '/babies', '/trash']

// 캘린더 계열 화면에서는 + 가 일정 추가다. 사진 업로드는 타임라인과 날짜 시트에 남는다.
const SCHEDULE_ROUTES = ['/calendar', '/calendar/todo']

function FabTrigger({
  canUpload,
  canCreateStory,
  canCreateSchedule,
}: {
  canUpload: boolean
  canCreateStory: boolean
  canCreateSchedule: boolean
}) {
  const t = useTranslations('shell')
  const { open } = useUploadSheet()
  const { openCreate } = useScheduleForm()
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

  const goSchedule = useCallback(() => openCreate(null), [openCreate])

  // 업로드가 가능하면 항상 선택 시트를 띄운다 — 예전처럼 곧장 사진 선택기를 열면
  // "파일에서 선택" 이 어디에도 보이지 않아 존재를 알 수 없다. 업로드가 기본 동작이라는
  // 가정은 걷어냈다 — 사진 권한 없이 일정만 만들 수 있는 구성원도 + 를 쓴다.
  const onPress = useCallback(() => {
    const scheduleFirst = SCHEDULE_ROUTES.includes(pathname) && canCreateSchedule
    if (scheduleFirst) return goSchedule()
    if (!canUpload) {
      if (canCreateStory) return goStory()
      if (canCreateSchedule) return goSchedule()
      return
    }
    // 데스크탑 단독 업로드는 시트(드래그앤드롭)에 두 진입점이 다 있어 한 단계 생략.
    if (isDesktop && !canCreateStory && !canCreateSchedule) return open()
    setChooserOpen(true)
  }, [canUpload, canCreateStory, canCreateSchedule, goStory, goSchedule, isDesktop, open, pathname])

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
  const scheduleFirst = SCHEDULE_ROUTES.includes(pathname) && canCreateSchedule
  const only = [canUpload, canCreateStory, canCreateSchedule].filter(Boolean).length === 1
  const fabIcon = scheduleFirst
    ? CalendarPlus
    : !only
      ? Plus
      : canUpload
        ? ImagePlus
        : canCreateStory
          ? PencilLine
          : CalendarPlus
  const fabLabel = scheduleFirst
    ? t('addSchedule')
    : !only
      ? t('addFab')
      : canUpload
        ? t('uploadFab')
        : canCreateStory
          ? t('addStory')
          : t('addSchedule')
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
          {canCreateSchedule && (
            <ChooserRow
              icon={<CalendarPlus size={20} strokeWidth={2} />}
              title={t('addSchedule')}
              desc={t('addScheduleDesc')}
              onClick={() => {
                setChooserOpen(false)
                goSchedule()
              }}
            />
          )}
          {canUpload && (
            <>
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
            </>
          )}
        </div>
      </Sheet>
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
  scheduleBabies,
  pushEnabled,
}: {
  children: ReactNode
  capabilities: Capability[]
  canCreateStory: boolean
  storyBabyId: string | null
  scheduleBabies: ScheduleBabyOption[]
  pushEnabled: boolean
}) {
  // FAB adds content. 업로드만으로 가리지 않는다 — 사진 권한이 없어도 스토리나 일정을
  // 만들 수 있는 구성원에게는 버튼이 있어야 한다(예전엔 버튼 자체가 사라졌다).
  const features = useFeatures()
  const canUpload = capabilities.includes('asset.upload')
  const canCreateSchedule = features.schedule && capabilities.includes('schedule.create')
  const showFab = canUpload || canCreateStory || canCreateSchedule
  return (
    <ToastProvider swipeDirection="down">
      {/* 영상 전체화면 중의 뒤로가기가 페이지를 떠나지 않게 — 앱 셸 전체에 한 번만. */}
      <FullscreenBackGuard />
      <ToastEmitterProvider>
        <FamilySSEProvider>
          <UploadSheetProvider canCreateStory={canCreateStory} storyBabyId={storyBabyId}>
            <ScheduleFormProvider
              babies={scheduleBabies}
              pushEnabled={pushEnabled}
              canCreate={canCreateSchedule}
            >
              {children}
              {showFab && (
                <FabTrigger
                  canUpload={canUpload}
                  canCreateStory={canCreateStory}
                  canCreateSchedule={canCreateSchedule}
                />
              )}
            </ScheduleFormProvider>
          </UploadSheetProvider>
        </FamilySSEProvider>
      </ToastEmitterProvider>
      <ToastViewport />
    </ToastProvider>
  )
}
