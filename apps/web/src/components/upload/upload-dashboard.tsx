'use client'
import { useToast } from '@/lib/toast'
import Uppy, { type UppyFile } from '@uppy/core'
import Tus from '@uppy/tus'
import { ImagePlus, X } from 'lucide-react'
import { type ChangeEvent, type DragEvent, useCallback, useEffect, useRef, useState } from 'react'
import { UploadProgressBar } from './UploadProgressBar'
import { startUpload } from './actions'

type UppyFileMeta = { uploadToken?: string; assetId?: string }
type UppyBody = { xhr: XMLHttpRequest }
type FileRow = UppyFile<UppyFileMeta, UppyBody>

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function FileThumb({ file }: { file: FileRow }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    if (!file.data || !(file.data instanceof Blob)) return
    if (!file.type?.startsWith('image/')) return
    const url = URL.createObjectURL(file.data)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file.data, file.type])

  if (src) {
    return <img src={src} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
  }
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-base-100 text-[10px] text-base-500 dark:bg-base-800">
      {file.type?.startsWith('video/') ? 'VIDEO' : 'FILE'}
    </div>
  )
}

function FileRowItem({
  file,
  onRemove,
  onAssetDone,
}: {
  file: FileRow
  onRemove: (id: string) => void
  onAssetDone: (assetId: string) => void
}) {
  const uploadComplete = file.progress?.uploadComplete ?? false
  const percentage = Math.round(file.progress?.percentage ?? 0)
  const assetId = file.meta?.assetId
  const uploadToken = file.meta?.uploadToken

  return (
    <li className="flex items-center gap-3 rounded-xl px-1 py-2">
      <FileThumb file={file} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{file.name}</div>
            <div className="text-xs text-base-500">{formatSize(file.size ?? 0)}</div>
          </div>
          {!uploadComplete && (
            <button
              type="button"
              aria-label="제거"
              onClick={() => onRemove(file.id)}
              className="rounded-full p-1 text-base-400 hover:bg-base-100 hover:text-base-700 dark:hover:bg-base-800 dark:hover:text-base-200"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="mt-1.5">
          {uploadComplete ? (
            assetId && uploadToken ? (
              <UploadProgressBar
                assetId={assetId}
                uploadToken={uploadToken}
                onComplete={() => onAssetDone(assetId)}
              />
            ) : (
              <div className="text-xs text-base-500">처리 대기 중…</div>
            )
          ) : (
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-base-100 dark:bg-base-800">
                <div
                  className="h-full bg-point-500 transition-[width] duration-200"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-base-500">
                {percentage}%
              </span>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

export function UploadDashboard({ onComplete }: { onComplete: () => void }) {
  const toast = useToast()
  const [files, setFiles] = useState<FileRow[]>([])
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const markAssetDone = useCallback((assetId: string) => {
    setDoneIds((prev) => {
      if (prev.has(assetId)) return prev
      const next = new Set(prev)
      next.add(assetId)
      return next
    })
  }, [])

  const [uppy] = useState<Uppy<UppyFileMeta, UppyBody>>(() => {
    const u = new Uppy<UppyFileMeta, UppyBody>({
      restrictions: {
        maxFileSize: MAX_FILE_SIZE,
        allowedFileTypes: ['image/*', 'video/*'],
      },
      autoProceed: true,
    }).use(Tus, {
      chunkSize: 8 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000],
      headers: (file) => {
        const token = file.meta?.uploadToken
        return token ? { authorization: `Bearer ${token}` } : {}
      },
    })

    u.addPreProcessor(async (fileIDs) => {
      for (const id of fileIDs) {
        const file = u.getFile(id)
        if (!file) continue
        if (file.meta?.uploadToken) continue
        const init = await startUpload({
          mime: file.type ?? 'application/octet-stream',
          sizeBytes: file.size ?? 0,
          originalName: file.name ?? `upload-${id}`,
        })
        u.setFileMeta(id, { uploadToken: init.uploadToken, assetId: init.assetId })
        u.setFileState(id, {
          tus: { uploadUrl: init.tusUploadUrl },
        })
      }
    })

    return u
  })

  // Sync Uppy file state to React.
  useEffect(() => {
    const sync = () => setFiles(uppy.getFiles() as FileRow[])
    sync()
    uppy.on('file-added', sync)
    uppy.on('file-removed', sync)
    uppy.on('upload-progress', sync)
    uppy.on('upload-success', sync)
    uppy.on('upload-error', sync)
    uppy.on('preprocess-complete', sync)
    return () => {
      uppy.off('file-added', sync)
      uppy.off('file-removed', sync)
      uppy.off('upload-progress', sync)
      uppy.off('upload-success', sync)
      uppy.off('upload-error', sync)
      uppy.off('preprocess-complete', sync)
    }
  }, [uppy])

  // Surface errors as toasts.
  useEffect(() => {
    const onError = (file: FileRow | undefined, error: Error) => {
      toast({
        title: `${file?.name ?? '파일'} 업로드 실패`,
        description: error.message,
        variant: 'danger',
      })
    }
    const onRestrictionFailed = (_file: FileRow | undefined, error: Error) => {
      toast({
        title: '업로드 제한',
        description: error.message,
        variant: 'danger',
      })
    }
    uppy.on('upload-error', onError)
    uppy.on('restriction-failed', onRestrictionFailed)
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
      ;(window as unknown as { __uppy?: typeof uppy }).__uppy = uppy
    }
    return () => {
      uppy.off('upload-error', onError)
      uppy.off('restriction-failed', onRestrictionFailed)
    }
  }, [uppy, toast])

  // Auto-close once every queued file has finished processing (status: ready/failed).
  // Slight delay so the user sees "완료" land before the sheet dismisses.
  useEffect(() => {
    if (files.length === 0) return
    const allHaveAsset = files.every((f) => f.meta?.assetId)
    if (!allHaveAsset) return
    const allDone = files.every((f) => {
      const id = f.meta?.assetId
      return id ? doneIds.has(id) : false
    })
    if (!allDone) return
    const t = setTimeout(() => onComplete(), 700)
    return () => clearTimeout(t)
  }, [files, doneIds, onComplete])

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const arr = Array.from(list)
      for (const f of arr) {
        try {
          uppy.addFile({
            name: f.name,
            type: f.type,
            data: f,
          })
        } catch (e) {
          toast({
            title: `${f.name} 추가 실패`,
            description: (e as Error).message,
            variant: 'danger',
          })
        }
      }
    },
    [uppy, toast],
  )

  const onPick = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) addFiles(e.target.files)
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

  const remove = useCallback(
    (id: string) => {
      uppy.removeFile(id)
    },
    [uppy],
  )

  const hasFiles = files.length > 0

  return (
    <div className="flex flex-col gap-3">
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
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={onPick}
          className="hidden"
        />
        <p className="mt-2 text-xs text-base-500">최대 2GB · 이미지·영상</p>
      </div>

      {hasFiles && (
        <ul className="max-h-[360px] divide-y divide-base-100 overflow-y-auto rounded-xl border border-base-200 px-1 dark:divide-base-800 dark:border-base-800">
          {files.map((f) => (
            <FileRowItem key={f.id} file={f} onRemove={remove} onAssetDone={markAssetDone} />
          ))}
        </ul>
      )}
    </div>
  )
}
