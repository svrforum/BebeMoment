'use client'
import { collectAssetIds } from '@/components/upload/collect-asset-ids'
import { ReorderRow } from '@/components/upload/reorder-row'
import { UploadEditor } from '@/components/upload/upload-editor'
import { useUploadManager } from '@/components/upload/upload-manager'
import { useOrderedKeys } from '@/components/upload/use-ordered-keys'
import { pickThumbUrl, pickVideoPosterUrl } from '@/lib/asset-url'
import { useToast } from '@/lib/toast'
import type { AssetUrls } from '@bebe/media-client'
import { ChevronDown, Globe, ImagePlus, Loader2, Pencil, ShieldCheck, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react'

const EDITABLE = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_PHOTOS = 10

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

type Visibility = 'family' | 'guardians'
type ExistingAsset = { id: string; kind: 'image' | 'video'; urls: AssetUrls | null }
type NewAttachment = {
  fileId: string
  type: string
  previewUrl: string | null
  assetId: string | null
}

/**
 * 스토리 편집 폼 — 내용 + 사진(기기에서 직접 업로드)만. 타임라인 컴포저와 동일한
 * 업로드 메커니즘(useUploadManager + UploadEditor)을 쓴다. 제목·기분·날짜·아기 선택은
 * 노출하지 않으며, PATCH 는 body + assetIds 만 보내 기존 값(있다면)은 보존한다.
 */
export function StoryEditForm({
  entryId,
  defaultBody,
  existingAssets,
  canUpload,
  viewerRole,
  defaultVisibility,
}: {
  entryId: string
  defaultBody: string
  existingAssets: ExistingAsset[]
  canUpload: boolean
  viewerRole: 'owner' | 'guardian' | 'family'
  defaultVisibility: Visibility
}) {
  const router = useRouter()
  const toast = useToast()
  const t = useTranslations('story')
  const { files, addFiles, removeFile, clearStaged, startStagedUploads, replaceFileData } =
    useUploadManager()
  const filesRef = useRef(files)
  filesRef.current = files

  const canPostGuardian = viewerRole === 'owner' || viewerRole === 'guardian'

  const [body, setBody] = useState(defaultBody)
  const [visibility, setVisibility] = useState<Visibility>(defaultVisibility)
  const [visMenuOpen, setVisMenuOpen] = useState(false)
  const tu = useTranslations('upload')
  const [kept, setKept] = useState<ExistingAsset[]>(existingAssets)
  const [attachments, setAttachments] = useState<NewAttachment[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing] = useState<{ fileId: string; dataUrl: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const photoCount = kept.length + attachments.length

  // 기존(e:assetId) + 신규(n:fileId) 를 한 줄로 섞어 드래그 재정렬. 1번 = 대표(썸네일).
  const currentKeys = [...kept.map((a) => `e:${a.id}`), ...attachments.map((a) => `n:${a.fileId}`)]
  const [order, setOrder] = useOrderedKeys(currentKeys)
  const orderRef = useRef(order)
  orderRef.current = order

  // 업로드 매니저 files 의 meta.assetId 를 우리 attachment 로 동기화 (컴포저와 동일).
  // biome-ignore lint/correctness/useExhaustiveDependencies: files 변경 시에만 재동기화; attachments 읽기는 가드.
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

  // 언마운트 시 object URL 정리 + 시작 안 한 staged 파일을 Uppy 에서 비운다(편집을
  // 저장 없이 떠난 경우). 그대로 두면 같은 사진 재선택이 noDuplicates 로 막혔다.
  // 저장 후 이탈이면 업로드가 started 라 clearStaged 가 건드리지 않는다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 언마운트 1회 정리.
  useEffect(() => {
    return () => {
      for (const a of attachments) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
      clearStaged()
    }
  }, [])

  const onPick = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files
      if (!list) return
      const picked = Array.from(list)
      e.target.value = ''
      const room = MAX_PHOTOS - photoCount
      if (room <= 0) {
        toast({ title: t('edit.maxPhotos', { max: MAX_PHOTOS }), variant: 'danger' })
        return
      }
      const limited = picked.slice(0, room)
      const ids = await addFiles(limited)
      const fresh: NewAttachment[] = []
      for (let i = 0; i < ids.length; i++) {
        const fileId = ids[i]
        const file = limited[i]
        if (!fileId || !file) continue
        const isMedia = file.type.startsWith('image/') || file.type.startsWith('video/')
        fresh.push({
          fileId,
          type: file.type,
          previewUrl: isMedia ? URL.createObjectURL(file) : null,
          assetId: null,
        })
      }
      if (fresh.length > 0) setAttachments((prev) => [...prev, ...fresh])
    },
    [addFiles, photoCount, toast, t],
  )

  const removeAttachment = useCallback(
    (fileId: string) => {
      // Uppy 에서도 제거 — 같은 사진 재선택이 noDuplicates 로 막히지 않게.
      removeFile(fileId)
      setAttachments((prev) => {
        const target = prev.find((a) => a.fileId === fileId)
        if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
        return prev.filter((a) => a.fileId !== fileId)
      })
    },
    [removeFile],
  )

  const removeExisting = useCallback((id: string) => {
    setKept((prev) => prev.filter((a) => a.id !== id))
  }, [])

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

  const submit = useCallback(async () => {
    const trimmed = body.trim()
    if (!trimmed && photoCount === 0) {
      toast({ title: t('edit.needContent'), variant: 'danger' })
      return
    }
    if (submitting) return
    setSubmitting(true)
    try {
      // 스토리에 추가하는 사진 — 개별 '사진 추가' 푸시 생략(스토리 콘텐츠로 묶음).
      if (attachments.length > 0) startStagedUploads({ notify: false })
      // 통합 순서(order)에서 신규(n:fileId)만 추려 assetId 를 모으고, 그 순서대로
      // 기존(e:assetId)과 섞어 최종 assetIds 를 만든다 — 드래그한 순서 그대로 저장.
      const newFileIds = orderRef.current.filter((k) => k.startsWith('n:')).map((k) => k.slice(2))
      const newAssetIds = await collectAssetIds(() => filesRef.current, newFileIds)
      if (newAssetIds.length !== newFileIds.length) {
        throw new Error(t('edit.uploadNotReady'))
      }
      const assetIdByFileId = new Map(newFileIds.map((fid, i) => [fid, newAssetIds[i]]))
      const assetIds = orderRef.current
        .map((k) => (k.startsWith('e:') ? k.slice(2) : assetIdByFileId.get(k.slice(2))))
        .filter((id): id is string => typeof id === 'string')
      const res = await fetch(`/api/story/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed || ' ', assetIds, visibility }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? t('edit.saveFailed'))
      }
      const saved = (await res.json().catch(() => ({}))) as { publicNo?: number }
      router.push(`/story/${saved.publicNo ?? entryId}`)
      router.refresh()
    } catch (e) {
      toast({ title: (e as Error).message, variant: 'danger' })
      setSubmitting(false)
    }
  }, [
    body,
    photoCount,
    attachments,
    entryId,
    visibility,
    submitting,
    startStagedUploads,
    router,
    toast,
    t,
  ])

  return (
    <div className="rounded-3xl border border-base-200/70 bg-base-0 p-4 shadow-card dark:border-base-800/70 dark:bg-base-900">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('edit.bodyPlaceholder')}
        rows={6}
        maxLength={20000}
        className="w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-base-400"
      />

      {photoCount > 0 && (
        <div className="mt-3">
          <ReorderRow
            keys={order}
            onReorder={setOrder}
            coverLabel={tu('coverBadge')}
            renderItem={(key) => {
              if (key.startsWith('e:')) {
                const a = kept.find((x) => x.id === key.slice(2))
                if (!a) return null
                const thumb = a.kind === 'video' ? pickVideoPosterUrl(a.urls) : pickThumbUrl(a.urls)
                return (
                  <div className="group relative h-20 w-20 overflow-hidden rounded-xl bg-base-100 dark:bg-base-800">
                    {thumb ? (
                      // biome-ignore lint/performance/noImgElement: 미디어 서버 signed URL — next/image 부적합
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-base-500">
                        {t('edit.processing')}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeExisting(a.id)}
                      aria-label={t('edit.remove')}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                    >
                      <X size={12} strokeWidth={2.6} />
                    </button>
                  </div>
                )
              }
              const a = attachments.find((x) => x.fileId === key.slice(2))
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
                    // biome-ignore lint/performance/noImgElement: 로컬 미리보기 object URL
                    <img src={a.previewUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-base-500">
                      {t('edit.file')}
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
                    aria-label={t('edit.remove')}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <X size={12} strokeWidth={2.6} />
                  </button>
                  {!submitting && EDITABLE.has(a.type) && (
                    <button
                      type="button"
                      onClick={() => openEditor(a.fileId)}
                      aria-label={t('edit.editPhoto')}
                      className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                    >
                      <Pencil size={11} strokeWidth={2.4} />
                    </button>
                  )}
                </div>
              )
            }}
          />
          {photoCount > 1 && (
            <p className="mt-1.5 text-[11px] text-base-400">{tu('reorderHint')}</p>
          )}
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
          {canUpload ? (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting || photoCount >= MAX_PHOTOS}
                aria-label={t('edit.addPhoto')}
                className="flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-base-600 transition hover:bg-base-100 hover:text-point-500 disabled:opacity-40 dark:text-base-300 dark:hover:bg-base-800"
              >
                <ImagePlus size={18} strokeWidth={2} />
                <span>{t('edit.addPhoto')}</span>
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
          ) : null}
          {canPostGuardian && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setVisMenuOpen((v) => !v)}
                className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium text-base-600 transition-colors hover:bg-base-100 dark:text-base-300 dark:hover:bg-base-800"
                aria-label={t('edit.visibility')}
                aria-expanded={visMenuOpen}
              >
                {visibility === 'family' ? (
                  <Globe size={13} strokeWidth={2.2} />
                ) : (
                  <ShieldCheck size={13} strokeWidth={2.2} className="text-point-500" />
                )}
                <span>
                  {visibility === 'family'
                    ? t('edit.visibilityFamily')
                    : t('edit.visibilityGuardians')}
                </span>
                <ChevronDown size={12} strokeWidth={2.2} />
              </button>
              {visMenuOpen && (
                <>
                  <button
                    type="button"
                    aria-label={t('edit.remove')}
                    onClick={() => setVisMenuOpen(false)}
                    className="fixed inset-0 z-30 cursor-default bg-transparent"
                  />
                  <div className="absolute left-0 bottom-full z-40 mb-2 w-56 overflow-hidden rounded-2xl border border-base-200/70 bg-base-0 shadow-elevated dark:border-base-800/70 dark:bg-base-900">
                    <VisibilityOption
                      active={visibility === 'family'}
                      icon={<Globe size={14} strokeWidth={2.2} />}
                      title={t('edit.visibilityFamily')}
                      subtitle={t('edit.visibilityFamilyDesc')}
                      onClick={() => {
                        setVisibility('family')
                        setVisMenuOpen(false)
                      }}
                    />
                    <VisibilityOption
                      active={visibility === 'guardians'}
                      icon={<ShieldCheck size={14} strokeWidth={2.2} className="text-point-500" />}
                      title={t('edit.visibilityGuardians')}
                      subtitle={t('edit.visibilityGuardiansDesc')}
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
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={submitting || (body.trim().length === 0 && photoCount === 0)}
          className="rounded-full bg-point-500 px-5 py-1.5 text-[13px] font-semibold text-white transition active:scale-95 hover:bg-point-600 disabled:opacity-50"
        >
          {submitting ? t('edit.saving') : t('edit.save')}
        </button>
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
