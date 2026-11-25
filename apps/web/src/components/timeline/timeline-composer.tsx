'use client'
import dynamic from 'next/dynamic'
import { smoothScroll } from '@/lib/motion'
import { useUploadManager } from '@/components/upload/upload-manager'
import { useStorySubmit } from '@/components/upload/use-story-submit'
import { Input, Label } from '@/components/ui/input'
import { isSubmittableDayKey, localDayKey } from '@/lib/day-key'
import { useToast } from '@/lib/toast'
import {
  CalendarDays,
  ChevronDown,
  FolderOpen,
  Globe,
  ImagePlus,
  Loader2,
  Pencil,
  PencilLine,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

// 사진을 담거나 편집하기 전에는 쓰지 않는 무거운 조각 — 타임라인 첫 로딩에서 뺀다.
// ReorderRow 는 framer-motion(≈43KB gzip), UploadEditor 는 react-image-crop·piexif(≈18KB gzip)를 끌고 온다.
const ReorderRow = dynamic(
  () => import('@/components/upload/reorder-row').then((m) => ({ default: m.ReorderRow })),
  { ssr: false },
)
const UploadEditor = dynamic(
  () => import('@/components/upload/upload-editor').then((m) => ({ default: m.UploadEditor })),
  { ssr: false },
)

const EDITABLE = new Set(['image/jpeg', 'image/png', 'image/webp'])

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

type Props = {
  userDisplayName: string
  userAvatarPath: string | null
  babyId: string | null
  /** Viewer's role — gates the "보호자만" visibility option. Family viewers
   *  can't post guardians-only entries (they can only see their own role). */
  viewerRole: 'owner' | 'guardian' | 'family'
  /** Gates the photo-attach button. Family viewers without `asset.upload`
   *  can still post text-only diary entries (`record.create`). */
  canUpload: boolean
}

type Visibility = 'family' | 'guardians'

type Attachment = {
  fileId: string
  name: string
  type: string
  previewUrl: string | null
  /** Asset id once the manager's preprocessor finishes. */
  assetId: string | null
  /** Asset reached `ready`. */
  ready: boolean
}

/**
 * SNS-style top-of-timeline post composer. One submit creates:
 *   1) diary entry (body + entryDate — 기본은 오늘, 사용자가 고르거나 사진 촬영일
 *      제안을 받아들이면 그 날짜)
 *   2) attached photos as regular media uploads (visible in the timeline
 *      grid like any other upload)
 *   3) the journal entry references those uploads via StoryAsset,
 *      so the entry's card shows the photos as thumbs.
 *
 * Photos go through the shared upload manager so the floating progress
 * pill picks them up too. The composer holds its own attachment list:
 * the manager wipes its queue after each batch finishes, but our list
 * already captured the asset id by then so submit still works.
 */
export function TimelineComposer({
  userDisplayName,
  userAvatarPath,
  babyId,
  viewerRole,
  canUpload,
}: Props) {
  const t = useTranslations('timeline')
  const tu = useTranslations('upload')
  const router = useRouter()
  const toast = useToast()
  const { files, addFiles, removeFile, clearStaged, replaceFileData } = useUploadManager()
  const submitStory = useStorySubmit('timeline-composer')

  const canPostGuardian = viewerRole === 'owner' || viewerRole === 'guardian'

  const [body, setBody] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [visibility, setVisibility] = useState<Visibility>('family')
  const [visMenuOpen, setVisMenuOpen] = useState(false)
  const [entryDate, setEntryDate] = useState(localDayKey)
  const [editing, setEditing] = useState<{ fileId: string; dataUrl: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const anyFileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // `/story/new` 가 `/timeline#composer` 로 리다이렉트됨 — 해시가 있으면 컴포저를 펼친다.
  // 스크롤·포커스는 아래 expanded 효과가 단일 지점에서 처리한다(경쟁 방지). 위치는 브라우저의
  // #composer 해시 스크롤 + scroll-margin-top(sticky 헤더 회피)이 맡는다.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const openIfHash = () => {
      if (window.location.hash === '#composer') setExpanded(true)
    }
    // FAB '스토리 쓰기' 는 이미 /timeline 에 있을 때 커스텀 이벤트로 컴포저를 펼친다.
    // (해시가 이미 #composer 로 남아 있으면 hashchange 가 안 떠서 hash 만으로는 부족.)
    const openComposer = () => {
      setExpanded(true)
      containerRef.current?.scrollIntoView({ behavior: smoothScroll(), block: 'start' })
    }
    openIfHash()
    // 다른 라우트에서 /timeline#composer 로 왔을 땐 위 mount 체크가, 그 외 hashchange 도 처리.
    window.addEventListener('hashchange', openIfHash)
    window.addEventListener('bebe:open-composer', openComposer)
    return () => {
      window.removeEventListener('hashchange', openIfHash)
      window.removeEventListener('bebe:open-composer', openComposer)
    }
  }, [])

  // 펼쳐지면 textarea 에 포커스 — 레이아웃·키보드가 정착한 뒤 한 번만(setTimeout). focus()
  // 가 textarea 를 키보드 위로 스크롤하고, html 의 scroll-padding-top(globals.css)이 sticky 헤더에
  // 안 가리게 한다. (과거: hash 효과의 smooth scrollIntoView(block:start) + 이중 focus 가
  // 키보드 열림과 경쟁해 글쓰기창이 헤더 뒤로 밀려 안 보였다 — 스토리 '쓰기' 포커스 버그.)
  useEffect(() => {
    if (!expanded) return
    const t = setTimeout(() => textareaRef.current?.focus(), 90)
    return () => clearTimeout(t)
  }, [expanded])

  // Sync asset-id + ready state from the upload manager into our own
  // attachment objects. Keeps progress info alive after the manager
  // cancelAlls its queue once a batch is fully processed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-syncs only when `files` changes; the attachments read is a guard, not a trigger
  useEffect(() => {
    if (attachments.length === 0) return
    const byFileId = new Map(files.map((f) => [f.id, f]))
    setAttachments((prev) => {
      let changed = false
      const next = prev.map((a) => {
        const f = byFileId.get(a.fileId)
        if (!f) return a
        const newAssetId = (f.meta?.assetId as string | undefined) ?? a.assetId
        if (newAssetId !== a.assetId) {
          changed = true
          return { ...a, assetId: newAssetId }
        }
        return a
      })
      return changed ? next : prev
    })
  }, [files])

  // Cleanup object URLs on unmount.
  // biome-ignore lint/correctness/useExhaustiveDependencies: unmount-only cleanup; deliberately runs once
  useEffect(() => {
    return () => {
      for (const a of attachments) {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
      }
    }
  }, [])

  const onPick = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files
      if (!list) return
      const picked = Array.from(list)
      e.target.value = ''
      const ids = await addFiles(picked)
      const fresh: Attachment[] = []
      for (let i = 0; i < ids.length; i++) {
        const fileId = ids[i]
        const file = picked[i]
        if (!fileId || !file) continue
        const isMedia = file.type.startsWith('image/') || file.type.startsWith('video/')
        fresh.push({
          fileId,
          name: file.name,
          type: file.type,
          previewUrl: isMedia ? URL.createObjectURL(file) : null,
          assetId: null,
          ready: false,
        })
      }
      if (fresh.length > 0) {
        // 업로드는 미루고 스테이징만 — 사용자가 올리기 전에 편집(크롭/회전)할 수
        // 있게. 실제 업로드는 submit 에서 startStagedUploads() 로 시작한다(파일
        // 업로드 시트와 동일 로직).
        setAttachments((prev) => [...prev, ...fresh])
        setExpanded(true)
      }
    },
    [addFiles],
  )

  const removeAttachment = useCallback(
    (fileId: string) => {
      // Uppy 에서도 제거해야 같은 사진 재선택이 noDuplicates 로 막히지 않는다.
      removeFile(fileId)
      setAttachments((prev) => {
        const target = prev.find((a) => a.fileId === fileId)
        if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
        return prev.filter((a) => a.fileId !== fileId)
      })
    },
    [removeFile],
  )

  const openEditor = useCallback(
    async (fileId: string) => {
      const f = files.find((x) => x.id === fileId)
      if (!f || !(f.data instanceof Blob)) return
      const dataUrl = await blobToDataUrl(f.data)
      setEditing({ fileId, dataUrl })
    },
    [files],
  )

  const applyEdit = useCallback(
    (fileId: string, blob: Blob) => {
      replaceFileData(fileId, blob)
      const nextUrl = URL.createObjectURL(blob)
      setAttachments((prev) =>
        prev.map((a) => {
          if (a.fileId !== fileId) return a
          if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
          return { ...a, previewUrl: nextUrl }
        }),
      )
    },
    [replaceFileData],
  )

  const reset = useCallback(() => {
    // 시작 안 한 staged 파일을 Uppy 에서 정리(취소). 제출 후 호출돼도 진행 중
    // 업로드는 started 라 건드리지 않는다(백그라운드 처리 보존).
    clearStaged()
    setAttachments((prev) => {
      for (const a of prev) {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
      }
      return []
    })
    setBody('')
    setEntryDate(localDayKey())
    setExpanded(false)
  }, [clearStaged])

  // 본문/첨부는 보존한 채 펼침만 닫는다. 다시 펼치면 그대로 이어쓰기 가능.
  const collapse = useCallback(() => {
    setVisMenuOpen(false)
    setExpanded(false)
  }, [])

  const allHaveAssetIds = useMemo(
    () => attachments.length === 0 || attachments.every((a) => !!a.assetId),
    [attachments],
  )

  const submit = useCallback(async () => {
    const trimmed = body.trim()
    // 스토리는 사진 필수 — 최소 1장 없으면 등록 불가.
    if (attachments.length === 0) {
      toast({ title: t('composer.needPhoto'), variant: 'danger' })
      return
    }
    if (submitting) return
    setSubmitting(true)
    try {
      const r = await submitStory({
        fileIds: attachments.map((a) => a.fileId),
        // 사진을 올리기 전에 날짜부터 본다. 올린 뒤 서버가 거절하면 실패 처리가 이미
        // 올라간 사진을 전부 휴지통으로 되돌린다 — 날짜 오타의 대가로는 너무 크다.
        invalid: isSubmittableDayKey(entryDate) ? null : t('composer.entryDateInvalid'),
        save: async (assetIds) => {
          const res = await fetch('/api/story', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              babyId,
              entryDate: entryDate,
              body: trimmed || ' ',
              ...(visibility !== 'family' ? { visibility } : {}),
              ...(assetIds.length > 0 ? { assetIds } : {}),
            }),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error((err as { error?: string }).error ?? t('composer.submitFailed'))
          }
        },
      })
      if (r.ok) {
        reset()
        router.refresh()
      } else if (r.dropped.length > 0) {
        // 매니저가 치운 첨부는 다시 눌러도 시작할 게 없다 — 목록에서 빼서 막다른 길을
        // 만들지 않는다(사용자는 다시 담으면 된다).
        const gone = new Set(r.dropped)
        setAttachments((prev) => {
          for (const a of prev)
            if (gone.has(a.fileId) && a.previewUrl) URL.revokeObjectURL(a.previewUrl)
          return prev.filter((a) => !gone.has(a.fileId))
        })
      }
    } finally {
      setSubmitting(false)
    }
  }, [
    body,
    attachments,
    babyId,
    visibility,
    entryDate,
    reset,
    router,
    toast,
    submitting,
    submitStory,
    t,
  ])

  const initial = userDisplayName.charAt(0)
  const hasDraft = body.length > 0 || attachments.length > 0

  if (!expanded) {
    return (
      <div ref={containerRef} id="composer">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          // 이름은 보이는 글자 그대로(쓰다 만 글이면 그 글) — aria-label 로 덮으면 음성 제어가 화면의
          // 글자로 이 버튼을 찾지 못한다. 이니셜 아바타는 이름에서 뺀다.
          aria-expanded={false}
          className="group flex w-full items-center gap-3 rounded-full border border-transparent bg-base-0 py-2 pr-3 pl-2 text-left shadow-card transition-colors ease-ios hover:bg-base-100/60 active:scale-[0.995] dark:border-base-800/60 dark:bg-base-900 dark:hover:bg-base-800/40"
        >
          <span aria-hidden className="contents">
            <PillAvatar avatarPath={userAvatarPath} initial={initial} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[14px] text-base-500 dark:text-base-400">
            {hasDraft
              ? body.trim() || t('composer.photosAttached', { count: attachments.length })
              : t('composer.writeToday')}
          </span>
          <PencilLine
            size={16}
            strokeWidth={2}
            className="shrink-0 text-base-400 transition-colors group-hover:text-point-500"
          />
        </button>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      id="composer"
      className="rounded-3xl border border-transparent bg-base-0 p-4 shadow-card dark:border-base-800/70 dark:bg-base-900"
    >
      <div className="flex items-start gap-3">
        <Avatar avatarPath={userAvatarPath} initial={initial} />
        <div className="min-w-0 flex-1">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('composer.placeholder')}
            rows={3}
            maxLength={20000}
            className="w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-base-400"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                submit()
              } else if (e.key === 'Escape' && !hasDraft) {
                collapse()
              }
            }}
          />
        </div>
        <button
          type="button"
          onClick={collapse}
          aria-label={t('composer.collapse')}
          className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base-400 transition-colors hover:bg-base-100 hover:text-base-600 dark:hover:bg-base-800 dark:hover:text-base-300"
        >
          <X size={16} strokeWidth={2.2} />
        </button>
      </div>

      {attachments.length > 0 && (
        <div className="mt-3 pl-13">
          <ReorderRow
            keys={attachments.map((a) => a.fileId)}
            onReorder={(keys) =>
              setAttachments((prev) => {
                const byId = new Map(prev.map((a) => [a.fileId, a]))
                return keys.map((k) => byId.get(k)).filter((a): a is Attachment => !!a)
              })
            }
            coverLabel={tu('coverBadge')}
            renderItem={(fileId) => {
              const a = attachments.find((x) => x.fileId === fileId)
              if (!a) return null
              return (
                <div className="group relative h-20 w-20 overflow-hidden rounded-xl bg-base-100 dark:bg-base-800">
                  {a.previewUrl && a.type.startsWith('video/') ? (
                    <video
                      src={`${a.previewUrl}#t=0.1`}
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  ) : a.previewUrl ? (
                    <img src={a.previewUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-base-500">
                      {t('composer.file')}
                    </div>
                  )}
                  {submitting && !a.assetId && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.fileId)}
                    aria-label={t('composer.remove')}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white after:absolute after:-inset-1.5"
                  >
                    <X size={12} strokeWidth={2.6} />
                  </button>
                  {!submitting && EDITABLE.has(a.type) && (
                    <button
                      type="button"
                      onClick={() => openEditor(a.fileId)}
                      aria-label={t('composer.edit')}
                      className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white after:absolute after:-inset-1.5"
                    >
                      <Pencil size={11} strokeWidth={2.4} />
                    </button>
                  )}
                </div>
              )
            }}
          />
        </div>
      )}

      {editing && (
        <UploadEditor
          fileId={editing.fileId}
          originalDataUrl={editing.dataUrl}
          onApply={applyEdit}
          onClose={() => setEditing(null)}
        />
      )}

      {/* 좁은 화면(360px)에서 라벨과 날짜 컨트롤이 겹치지 않게 — 아바타 들여쓰기를 빼고
          라벨은 줄어들 수 있게 둔다. max 는 렌더마다 계산해 자정을 넘겨도 늙지 않는다. */}
      <div className="mt-3 flex items-center gap-2">
        <CalendarDays size={15} strokeWidth={2} className="shrink-0 text-base-400" />
        <Label htmlFor="composer-entry-date" className="mb-0 min-w-0 truncate">
          {t('composer.entryDate')}
        </Label>
        <Input
          id="composer-entry-date"
          type="date"
          max={localDayKey()}
          value={entryDate}
          onChange={(e) => setEntryDate(e.target.value)}
          className="h-9 w-auto shrink-0 rounded-xl px-3 text-[13px]"
        />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-base-100 pt-3 dark:border-base-800/60">
        <div className="flex items-center gap-1">
          {canUpload && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label={t('composer.attachPhoto')}
                className="flex h-9 w-9 items-center justify-center rounded-full text-base-500 transition hover:bg-base-100 hover:text-point-500 dark:hover:bg-base-800"
              >
                <ImagePlus size={18} strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => anyFileInputRef.current?.click()}
                aria-label={t('composer.attachFiles')}
                className="flex h-9 w-9 items-center justify-center rounded-full text-base-500 transition hover:bg-base-100 hover:text-point-500 dark:hover:bg-base-800"
              >
                <FolderOpen size={18} strokeWidth={2} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={onPick}
                className="hidden"
              />
              {/* accept 를 비워 문서 선택기를 연다 — 갤러리가 색인 못 한 카메라 파일용. */}
              <input
                ref={anyFileInputRef}
                type="file"
                multiple
                onChange={onPick}
                className="hidden"
              />
            </>
          )}
          {canPostGuardian && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setVisMenuOpen((v) => !v)}
                className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium text-base-600 transition-colors hover:bg-base-100 dark:text-base-300 dark:hover:bg-base-800"
                aria-expanded={visMenuOpen}
              >
                {/* 이름 = 용도 + 지금 값. aria-label 로 덮으면 '전체 공개/보호자만' 이 안 읽혀
                    화면낭독기 사용자는 이 스토리가 누구에게 보일지 알 수 없었다. */}
                <span className="sr-only">{t('composer.visibility')}: </span>
                {visibility === 'family' ? (
                  <Globe size={13} strokeWidth={2.2} aria-hidden />
                ) : (
                  <ShieldCheck size={13} strokeWidth={2.2} className="text-point-500" aria-hidden />
                )}
                <span>
                  {visibility === 'family'
                    ? t('composer.visibilityFamily')
                    : t('composer.visibilityGuardians')}
                </span>
                <ChevronDown size={12} strokeWidth={2.2} />
              </button>
              {visMenuOpen && (
                <>
                  <button
                    type="button"
                    aria-label={t('composer.close')}
                    onClick={() => setVisMenuOpen(false)}
                    className="fixed inset-0 z-30 cursor-default bg-transparent"
                  />
                  <div className="absolute left-0 bottom-full z-40 mb-2 w-56 overflow-hidden rounded-2xl border border-base-200/70 bg-base-0 shadow-elevated dark:border-base-800/70 dark:bg-base-900">
                    <VisibilityOption
                      active={visibility === 'family'}
                      icon={<Globe size={14} strokeWidth={2.2} />}
                      title={t('composer.visibilityFamily')}
                      subtitle={t('composer.visibilityFamilyDesc')}
                      onClick={() => {
                        setVisibility('family')
                        setVisMenuOpen(false)
                      }}
                    />
                    <VisibilityOption
                      active={visibility === 'guardians'}
                      icon={<ShieldCheck size={14} strokeWidth={2.2} className="text-point-500" />}
                      title={t('composer.visibilityGuardians')}
                      subtitle={t('composer.visibilityGuardiansDesc')}
                      onClick={() => {
                        setVisibility('guardians')
                        setVisMenuOpen(false)
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          )}
          {submitting && !allHaveAssetIds && (
            <span className="ml-1 text-[12px] text-base-500">{t('composer.preparingPhotos')}</span>
          )}
          {/* 비활성 '올리기' 는 이유를 말하지 않는다 — 터치에선 회색 버튼만 보였다. */}
          {!submitting && attachments.length === 0 && (
            <span id="composer-need-photo" className="ml-1 text-[12px] text-base-500">
              {t('composer.needPhoto')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasDraft && (
            <button
              type="button"
              onClick={reset}
              className="rounded-full px-3 py-1.5 text-[13px] font-medium text-base-500 hover:bg-base-100 dark:hover:bg-base-800"
            >
              {t('composer.cancel')}
            </button>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={submitting || attachments.length === 0}
            aria-describedby={attachments.length === 0 ? 'composer-need-photo' : undefined}
            className="rounded-full bg-point-600 px-4 py-1.5 text-[13px] font-semibold text-white transition active:scale-[0.96] hover:bg-point-700 disabled:opacity-50"
          >
            {submitting ? t('composer.submitting') : t('composer.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}

function VisibilityOption({
  active,
  icon,
  title,
  subtitle,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-base-100 dark:hover:bg-base-800 ${
        active ? 'bg-point-500/8 dark:bg-point-500/10' : ''
      }`}
    >
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-base-500">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-base-900 dark:text-base-50">{title}</div>
        <div className="mt-0.5 text-[12px] text-base-500">{subtitle}</div>
      </div>
    </button>
  )
}

function Avatar({ avatarPath, initial }: { avatarPath: string | null; initial: string }) {
  if (avatarPath) {
    return <img src={avatarPath} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-point-500/15 text-[14px] font-semibold text-point-700 dark:text-point-300">
      {initial}
    </div>
  )
}

function PillAvatar({ avatarPath, initial }: { avatarPath: string | null; initial: string }) {
  if (avatarPath) {
    return <img src={avatarPath} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-point-500/15 text-[12px] font-semibold text-point-700 dark:text-point-300">
      {initial}
    </div>
  )
}
