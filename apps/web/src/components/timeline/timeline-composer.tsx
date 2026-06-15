'use client'
import { UploadEditor } from '@/components/upload/upload-editor'
import { useUploadManager } from '@/components/upload/upload-manager'
import { useToast } from '@/lib/toast'
import {
  ChevronDown,
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
 *   1) diary entry (body + entryDate = today)
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
  const router = useRouter()
  const toast = useToast()
  const { files, addFiles, removeFile, clearStaged, startStagedUploads, replaceFileData } =
    useUploadManager()
  // 최신 매니저 files 를 ref 로 — submit 의 async 대기 루프가 닫힌(stale)
  // attachments 대신 실시간 assetId 를 읽을 수 있게.
  const filesRef = useRef(files)
  filesRef.current = files

  const canPostGuardian = viewerRole === 'owner' || viewerRole === 'guardian'

  const [body, setBody] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [visibility, setVisibility] = useState<Visibility>('family')
  const [visMenuOpen, setVisMenuOpen] = useState(false)
  const [editing, setEditing] = useState<{ fileId: string; dataUrl: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // `/story/new` 가 `/timeline#composer` 로 리다이렉트됨 — 해시가 있으면 컴포저를 펼친다.
  // 스크롤·포커스는 아래 expanded 효과가 단일 지점에서 처리한다(경쟁 방지). 위치는 브라우저의
  // #composer 해시 스크롤 + scroll-margin-top(sticky 헤더 회피)이 맡는다.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.hash !== '#composer') return
    setExpanded(true)
  }, [])

  // 펼쳐지면 textarea 에 포커스 — 레이아웃·키보드가 정착한 뒤 한 번만(setTimeout). focus()
  // 가 textarea 를 키보드 위로 스크롤하고, #composer 의 scroll-margin-top 이 sticky 헤더에
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
      // 이제(편집 끝난 뒤) 업로드 시작 — 편집된 데이터로 올라간다. notify:false 로 올려
      // 개별 '사진 추가' 푸시를 막는다 — 스토리 생성이 보내는 푸시 하나로 갈음(중복 방지).
      if (attachments.length > 0) startStagedUploads({ notify: false })
      const fileIds = attachments.map((a) => a.fileId)
      // assetId 는 매니저 files 의 meta 로 들어온다. 닫힌 attachments 가 아니라
      // filesRef(매 렌더 갱신)에서 읽어야 업로드 진행분이 보인다.
      const resolveIds = () =>
        fileIds
          .map((fid) => filesRef.current.find((f) => f.id === fid)?.meta?.assetId)
          .filter((id): id is string => typeof id === 'string')

      const deadline = Date.now() + 30_000
      while (Date.now() < deadline && resolveIds().length < fileIds.length) {
        await new Promise((r) => setTimeout(r, 200))
      }

      const finalAssetIds = resolveIds()
      if (finalAssetIds.length !== fileIds.length) {
        throw new Error(t('composer.uploadNotReady'))
      }

      const today = new Date().toISOString().slice(0, 10)
      const res = await fetch('/api/story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          babyId,
          entryDate: today,
          body: trimmed || ' ',
          ...(visibility !== 'family' ? { visibility } : {}),
          ...(finalAssetIds.length > 0 ? { assetIds: finalAssetIds } : {}),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? t('composer.submitFailed'))
      }
      reset()
      router.refresh()
    } catch (e) {
      toast({ title: (e as Error).message, variant: 'danger' })
    } finally {
      setSubmitting(false)
    }
  }, [
    body,
    attachments,
    babyId,
    visibility,
    reset,
    router,
    toast,
    submitting,
    startStagedUploads,
    t,
  ])

  const initial = userDisplayName.charAt(0)
  const hasDraft = body.length > 0 || attachments.length > 0

  if (!expanded) {
    return (
      <div
        ref={containerRef}
        id="composer"
        className="scroll-mt-[calc(env(safe-area-inset-top)+5.5rem)]"
      >
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label={t('composer.writeToday')}
          aria-expanded={false}
          className="group flex w-full items-center gap-3 rounded-full border border-base-200/60 bg-base-0 px-3 py-2 text-left transition-colors ease-ios hover:bg-base-100/60 active:scale-[0.995] dark:border-base-800/60 dark:bg-base-900 dark:hover:bg-base-800/40"
        >
          <PillAvatar avatarPath={userAvatarPath} initial={initial} />
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
      className="scroll-mt-[calc(env(safe-area-inset-top)+5.5rem)] rounded-3xl border border-base-200/70 bg-base-0 p-4 shadow-card dark:border-base-800/70 dark:bg-base-900"
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
        <div className="mt-3 flex flex-wrap gap-2 pl-13">
          {attachments.map((a) => (
            <div
              key={a.fileId}
              className="group relative h-20 w-20 overflow-hidden rounded-xl bg-base-100 dark:bg-base-800"
            >
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
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <X size={12} strokeWidth={2.6} />
              </button>
              {!submitting && EDITABLE.has(a.type) && (
                <button
                  type="button"
                  onClick={() => openEditor(a.fileId)}
                  aria-label={t('composer.edit')}
                  className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <Pencil size={11} strokeWidth={2.4} />
                </button>
              )}
            </div>
          ))}
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
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
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
                aria-label={t('composer.visibility')}
                aria-expanded={visMenuOpen}
              >
                {visibility === 'family' ? (
                  <Globe size={13} strokeWidth={2.2} />
                ) : (
                  <ShieldCheck size={13} strokeWidth={2.2} className="text-point-500" />
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
            className="rounded-full bg-point-500 px-4 py-1.5 text-[13px] font-semibold text-white transition active:scale-95 hover:bg-point-600 disabled:opacity-50"
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
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-base-100 dark:hover:bg-base-800 ${
        active ? 'bg-point-500/8 dark:bg-point-500/10' : ''
      }`}
    >
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-base-500">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-base-900 dark:text-base-50">{title}</div>
        <div className="mt-0.5 text-[11px] text-base-500">{subtitle}</div>
      </div>
    </button>
  )
}

function Avatar({ avatarPath, initial }: { avatarPath: string | null; initial: string }) {
  if (avatarPath) {
    return <img src={avatarPath} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-point-500/15 text-[14px] font-semibold text-point-500">
      {initial}
    </div>
  )
}

function PillAvatar({ avatarPath, initial }: { avatarPath: string | null; initial: string }) {
  if (avatarPath) {
    return <img src={avatarPath} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-point-500/15 text-[12px] font-semibold text-point-500">
      {initial}
    </div>
  )
}
