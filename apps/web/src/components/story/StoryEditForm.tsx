'use client'
import { UploadEditor } from '@/components/upload/upload-editor'
import { useUploadManager } from '@/components/upload/upload-manager'
import { pickThumbUrl, pickVideoPosterUrl } from '@/lib/asset-url'
import { useToast } from '@/lib/toast'
import type { AssetUrls } from '@bebe/media-client'
import { ImagePlus, Loader2, Pencil, X } from 'lucide-react'
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
}: {
  entryId: string
  defaultBody: string
  existingAssets: ExistingAsset[]
  canUpload: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const { files, addFiles, startStagedUploads, replaceFileData } = useUploadManager()
  const filesRef = useRef(files)
  filesRef.current = files

  const [body, setBody] = useState(defaultBody)
  const [kept, setKept] = useState<ExistingAsset[]>(existingAssets)
  const [attachments, setAttachments] = useState<NewAttachment[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing] = useState<{ fileId: string; dataUrl: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const photoCount = kept.length + attachments.length

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

  // 언마운트 시 object URL 정리.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 언마운트 1회 정리.
  useEffect(() => {
    return () => {
      for (const a of attachments) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
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
        toast({ title: `사진은 최대 ${MAX_PHOTOS}장까지예요`, variant: 'danger' })
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
    [addFiles, photoCount, toast],
  )

  const removeAttachment = useCallback((fileId: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.fileId === fileId)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((a) => a.fileId !== fileId)
    })
  }, [])

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
      toast({ title: '내용이나 사진을 추가해주세요', variant: 'danger' })
      return
    }
    if (submitting) return
    setSubmitting(true)
    try {
      if (attachments.length > 0) startStagedUploads()
      const fileIds = attachments.map((a) => a.fileId)
      const resolveIds = () =>
        fileIds
          .map((fid) => filesRef.current.find((f) => f.id === fid)?.meta?.assetId)
          .filter((id): id is string => typeof id === 'string')

      const deadline = Date.now() + 30_000
      while (Date.now() < deadline && resolveIds().length < fileIds.length) {
        await new Promise((r) => setTimeout(r, 200))
      }
      const newAssetIds = resolveIds()
      if (newAssetIds.length !== fileIds.length) {
        throw new Error('사진 업로드 준비가 끝나지 않았어요. 잠시 후 다시 시도해주세요.')
      }

      const assetIds = [...kept.map((a) => a.id), ...newAssetIds]
      const res = await fetch(`/api/story/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed || ' ', assetIds }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? '저장에 실패했어요')
      }
      const saved = (await res.json().catch(() => ({}))) as { publicNo?: number }
      router.push(`/story/${saved.publicNo ?? entryId}`)
      router.refresh()
    } catch (e) {
      toast({ title: (e as Error).message, variant: 'danger' })
      setSubmitting(false)
    }
  }, [body, photoCount, attachments, kept, entryId, submitting, startStagedUploads, router, toast])

  return (
    <div className="rounded-3xl border border-base-200/70 bg-base-0 p-4 shadow-card dark:border-base-800/70 dark:bg-base-900">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="오늘 어떤 이야기가 있었어요?"
        rows={6}
        maxLength={20000}
        className="w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-base-400"
      />

      {photoCount > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {kept.map((a) => {
            const thumb = a.kind === 'video' ? pickVideoPosterUrl(a.urls) : pickThumbUrl(a.urls)
            return (
              <div
                key={a.id}
                className="group relative h-20 w-20 overflow-hidden rounded-xl bg-base-100 dark:bg-base-800"
              >
                {thumb ? (
                  // biome-ignore lint/performance/noImgElement: 미디어 서버 signed URL — next/image 부적합
                  <img src={thumb} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-base-500">
                    처리 중
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeExisting(a.id)}
                  aria-label="제거"
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <X size={12} strokeWidth={2.6} />
                </button>
              </div>
            )
          })}
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
                // biome-ignore lint/performance/noImgElement: 로컬 미리보기 object URL
                <img src={a.previewUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-base-500">
                  파일
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
                aria-label="제거"
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <X size={12} strokeWidth={2.6} />
              </button>
              {!submitting && EDITABLE.has(a.type) && (
                <button
                  type="button"
                  onClick={() => openEditor(a.fileId)}
                  aria-label="편집"
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
        {canUpload ? (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting || photoCount >= MAX_PHOTOS}
              aria-label="사진 추가"
              className="flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-base-600 transition hover:bg-base-100 hover:text-point-500 disabled:opacity-40 dark:text-base-300 dark:hover:bg-base-800"
            >
              <ImagePlus size={18} strokeWidth={2} />
              <span>사진 추가</span>
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
        ) : (
          <span aria-hidden />
        )}
        <button
          type="button"
          onClick={submit}
          disabled={submitting || (body.trim().length === 0 && photoCount === 0)}
          className="rounded-full bg-point-500 px-5 py-1.5 text-[13px] font-semibold text-white transition active:scale-95 hover:bg-point-600 disabled:opacity-50"
        >
          {submitting ? '저장 중…' : '저장'}
        </button>
      </div>
    </div>
  )
}
