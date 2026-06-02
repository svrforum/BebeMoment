'use client'
import { isOptimizeEnabled, setOptimizeEnabled } from '@/lib/image-optimize'
import { useToast } from '@/lib/toast'
import { ImagePlus, Images, Pencil, PencilLine, Plus, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type ChangeEvent, type DragEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useUploadSheet } from './upload-sheet'
import { UploadProgressBar } from './UploadProgressBar'
import { UploadEditor } from './upload-editor'
import { type FileRow, useUploadManager } from './upload-manager'

// 편집기(크롭/회전/밝기)는 항상 JPEG 를 렌더하고 EXIF 재주입도 JPEG 원본만 읽는다.
// PNG/WebP 를 편집하면 JPEG 바이트가 원래 mime/확장자(png·webp)로 저장돼 오라벨되고
// EXIF(촬영일시·GPS)가 소실됐다 → 편집은 JPEG 원본으로만 허용한다("원본은 원본").
const EDITABLE = new Set(['image/jpeg'])

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

function Thumb({ file }: { file: FileRow }) {
  const [src, setSrc] = useState<string | null>(null)
  const isImage = file.type?.startsWith('image/') ?? false
  const isVideo = file.type?.startsWith('video/') ?? false
  useEffect(() => {
    if (!file.data || !(file.data instanceof Blob)) return
    if (!isImage && !isVideo) return
    const url = URL.createObjectURL(file.data)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file.data, isImage, isVideo])

  if (src && isVideo) {
    // 로컬 영상의 첫 프레임을 썸네일로(업로드 전이라 서버 포스터가 아직 없음).
    return (
      <video
        src={`${src}#t=0.1`}
        muted
        playsInline
        preload="metadata"
        className="h-full w-full rounded-xl object-cover"
      />
    )
  }
  return src ? (
    <img src={src} alt="" className="h-full w-full rounded-xl object-cover" />
  ) : (
    <div className="flex h-full w-full items-center justify-center rounded-xl bg-base-100 text-[10px] text-base-500 dark:bg-base-800">
      {isVideo ? 'VIDEO' : 'FILE'}
    </div>
  )
}

export function UploadDashboard({
  canCreateStory = false,
  storyBabyId = null,
}: {
  canCreateStory?: boolean
  storyBabyId?: string | null
}) {
  const {
    files,
    addFiles,
    removeFile,
    markAssetDone,
    startStagedUploads,
    replaceFileData,
    pauseAutoDismiss,
  } = useUploadManager()
  const router = useRouter()
  const toast = useToast()
  const { close } = useUploadSheet()
  const [dragOver, setDragOver] = useState(false)
  const [editing, setEditing] = useState<{ id: string; dataUrl: string } | null>(null)
  const [optimize, setOptimize] = useState(true)
  // 업로드 대상: 'photos'(개별 사진으로) | 'story'(한 스토리로 묶기).
  const [dest, setDest] = useState<'photos' | 'story'>('photos')
  const [storyBody, setStoryBody] = useState('')
  const [submittingStory, setSubmittingStory] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // 스토리 제출의 async 폴링이 신선한 assetId 를 읽도록 최신 files 를 ref 로.
  const filesRef = useRef(files)
  filesRef.current = files

  useEffect(() => {
    setOptimize(isOptimizeEnabled())
  }, [])

  // 스테이징한 사진들을 업로드한 뒤, 준비된 assetId 로 스토리 1건을 만든다.
  // (타임라인 컴포저와 동일 메커니즘 — 업로드 시작 후 meta.assetId 를 폴링.)
  const submitStory = useCallback(async () => {
    const stagedFiles = filesRef.current.filter((f) => !f.progress?.uploadStarted)
    if (stagedFiles.length === 0) {
      toast({ title: '사진을 최소 1장 추가해주세요', variant: 'danger' })
      return
    }
    if (submittingStory) return
    setSubmittingStory(true)
    // 제출이 끝날 때까지 자동정리(cancelAll)를 멈춰 스테이징 파일이 사라지지 않게 한다
    // (빠른 사진은 POST 전에 ready 처리돼 파일이 정리될 수 있어 실패 후 재시도가 깨졌다).
    pauseAutoDismiss(true)
    try {
      const fileIds = stagedFiles.map((f) => f.id)
      startStagedUploads()
      const resolveIds = () =>
        fileIds
          .map((fid) => filesRef.current.find((f) => f.id === fid)?.meta?.assetId)
          .filter((id): id is string => typeof id === 'string')

      const deadline = Date.now() + 30_000
      while (Date.now() < deadline && resolveIds().length < fileIds.length) {
        await new Promise((r) => setTimeout(r, 200))
      }
      const assetIds = resolveIds()
      if (assetIds.length !== fileIds.length) {
        // 타임아웃 — startStagedUploads 로 시작된 업로드는 계속 진행돼 타임라인에
        // 저장된다(사진은 유실되지 않음). "재시도"로 오안내하지 않는다: 이미 시작된
        // 파일은 재제출에서 제외되므로 재시도해도 다시 안 올라간다(§6 정직한 안내).
        throw new Error(
          '사진 업로드가 아직 끝나지 않았어요. 업로드 중인 사진은 타임라인에 저장되니 잠시 후 타임라인에서 확인해주세요.',
        )
      }

      const today = new Date().toISOString().slice(0, 10)
      const res = await fetch('/api/story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          babyId: storyBabyId,
          entryDate: today,
          body: storyBody.trim() || ' ',
          assetIds,
        }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? '스토리 등록 실패')
      }
      const { id } = (await res.json()) as { id: string }
      setStoryBody('')
      setDest('photos')
      close()
      router.push(`/story/${id}`)
    } catch (e) {
      toast({ title: (e as Error).message, variant: 'danger' })
    } finally {
      setSubmittingStory(false)
      pauseAutoDismiss(false)
    }
  }, [
    storyBody,
    storyBabyId,
    submittingStory,
    startStagedUploads,
    close,
    router,
    toast,
    pauseAutoDismiss,
  ])

  const onPick = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      // FileList 는 라이브 객체라 value='' 로 비우면 같이 비워진다. addFiles 가
      // 내부에서 즉시 스냅샷하지만, 안전을 호출부에 두어 Array.from 으로 먼저 고정한다(§17.20).
      if (e.target.files) addFiles(Array.from(e.target.files))
      e.target.value = ''
    },
    [addFiles],
  )

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOver(false)
      if (e.dataTransfer?.files) addFiles(e.dataTransfer.files)
    },
    [addFiles],
  )

  const openEditor = useCallback(async (file: FileRow) => {
    if (!(file.data instanceof Blob)) return
    const dataUrl = await blobToDataUrl(file.data)
    setEditing({ id: file.id, dataUrl })
  }, [])

  const staged = files.filter((f) => !f.progress?.uploadStarted)
  const started = files.filter((f) => f.progress?.uploadStarted)

  return (
    <div className="flex flex-col gap-3">
      {/* 항상 존재하는 파일 입력 — 드롭존 '파일 선택' 과 스테이징 '+' 타일 공용. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={onPick}
        className="hidden"
      />
      {files.length === 0 && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
            dragOver
              ? 'border-point-500 bg-point-50/40 dark:bg-point-500/10'
              : 'border-base-200 dark:border-base-800'
          }`}
        >
          <ImagePlus className="mx-auto h-10 w-10 text-base-400" />
          <p className="mt-3 text-sm font-medium">사진이나 영상을 끌어다 놓거나</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-2 rounded-full bg-base-900 px-4 py-2 text-sm font-medium text-base-50 transition active:scale-95 dark:bg-base-50 dark:text-base-900"
          >
            파일 선택
          </button>
          <p className="mt-2 text-xs text-base-500">최대 2GB · 이미지·영상</p>
        </div>
      )}

      {staged.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {staged.map((f) => (
              <div key={f.id} className="relative aspect-square">
                <Thumb file={f} />
                <button
                  type="button"
                  aria-label="제거"
                  onClick={() => removeFile(f.id)}
                  className="absolute top-1 right-1 rounded-full bg-black/55 p-1 text-white"
                >
                  <X size={14} />
                </button>
                {f.type && EDITABLE.has(f.type) && (
                  <button
                    type="button"
                    aria-label="편집"
                    onClick={() => openEditor(f)}
                    className="absolute right-1 bottom-1 rounded-full bg-black/55 p-1 text-white"
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            ))}
            {/* 추가 선택 타일 */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="사진·영상 추가"
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-base-200 text-base-400 transition hover:border-point-400 hover:text-point-500 dark:border-base-700"
            >
              <Plus size={22} strokeWidth={2} />
              <span className="text-[11px] font-medium">추가</span>
            </button>
          </div>
          {canCreateStory && (
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-base-100 p-1 dark:bg-base-800">
              <button
                type="button"
                onClick={() => setDest('photos')}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-semibold transition ${
                  dest === 'photos'
                    ? 'bg-base-0 text-base-900 shadow-sm dark:bg-base-900 dark:text-base-50'
                    : 'text-base-500'
                }`}
              >
                <Images size={15} strokeWidth={2.2} />
                사진으로
              </button>
              <button
                type="button"
                onClick={() => setDest('story')}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-semibold transition ${
                  dest === 'story'
                    ? 'bg-base-0 text-base-900 shadow-sm dark:bg-base-900 dark:text-base-50'
                    : 'text-base-500'
                }`}
              >
                <PencilLine size={15} strokeWidth={2.2} />
                스토리로
              </button>
            </div>
          )}
          {dest === 'story' && (
            <textarea
              value={storyBody}
              onChange={(e) => setStoryBody(e.target.value)}
              placeholder="오늘 어떤 이야기가 있었어요? (선택)"
              rows={3}
              maxLength={20000}
              className="w-full resize-none rounded-2xl border border-base-200 bg-transparent px-4 py-3 text-[15px] leading-relaxed outline-none placeholder:text-base-400 focus:border-point-400 dark:border-base-700"
            />
          )}
          <button
            type="button"
            onClick={() => {
              const next = !optimize
              setOptimize(next)
              setOptimizeEnabled(next)
            }}
            className="flex items-center justify-between rounded-2xl border border-base-200 px-4 py-3 text-left dark:border-base-700"
          >
            <span>
              <span className="block text-sm font-medium text-base-900 dark:text-base-50">
                용량 최적화
              </span>
              <span className="block text-[12px] text-base-400">
                {optimize
                  ? '화질 거의 그대로 용량↓ (긴 변 4096px·EXIF 보존)'
                  : '원본 그대로 업로드'}
              </span>
            </span>
            <span
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                optimize ? 'bg-point-500' : 'bg-base-300 dark:bg-base-600'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  optimize ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
              />
            </span>
          </button>
          <button
            type="button"
            onClick={dest === 'story' ? submitStory : startStagedUploads}
            disabled={submittingStory}
            className="rounded-full bg-point-500 py-3 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
          >
            {dest === 'story'
              ? submittingStory
                ? '스토리 올리는 중…'
                : `사진 ${staged.length}장으로 스토리 올리기`
              : `${staged.length}개 업로드`}
          </button>
        </>
      )}

      {started.length > 0 && (
        <ul className="max-h-[360px] divide-y divide-base-100 overflow-y-auto rounded-xl border border-base-200 px-1 dark:divide-base-800 dark:border-base-800">
          {started.map((f) => {
            const assetId = f.meta?.assetId
            const uploadToken = f.meta?.uploadToken
            const pct = Math.round(f.progress?.percentage ?? 0)
            const complete = f.progress?.uploadComplete ?? false
            return (
              <li key={f.id} className="flex items-center gap-3 px-1 py-2">
                <div className="h-12 w-12 shrink-0">
                  <Thumb file={f} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{f.name}</div>
                  <div className="mt-1.5">
                    {complete ? (
                      assetId && uploadToken ? (
                        <UploadProgressBar
                          assetId={assetId}
                          uploadToken={uploadToken}
                          onComplete={() => markAssetDone(assetId)}
                        />
                      ) : (
                        <div className="text-xs text-base-500">처리 대기 중…</div>
                      )
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-base-100 dark:bg-base-800">
                          <div
                            className="h-full bg-point-500 transition-[width] duration-200"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-base-500">
                          {pct}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {editing && (
        <UploadEditor
          fileId={editing.id}
          originalDataUrl={editing.dataUrl}
          onApply={replaceFileData}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
