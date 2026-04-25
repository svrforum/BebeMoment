'use client'
import { ImagePlus, X } from 'lucide-react'
import { type ChangeEvent, type DragEvent, useCallback, useEffect, useRef, useState } from 'react'
import { type FileRow, useUploadManager } from './upload-manager'
import { UploadProgressBar } from './UploadProgressBar'

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

export function UploadDashboard({ onFilesPicked }: { onFilesPicked?: () => void }) {
  const { files, addFiles, removeFile, markAssetDone } = useUploadManager()
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAdd = useCallback(
    (list: FileList | File[]) => {
      const added = addFiles(list)
      if (added > 0) onFilesPicked?.()
    },
    [addFiles, onFilesPicked],
  )

  const onPick = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) handleAdd(e.target.files)
      e.target.value = ''
    },
    [handleAdd],
  )

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOver(false)
      if (e.dataTransfer?.files) handleAdd(e.dataTransfer.files)
    },
    [handleAdd],
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
            <FileRowItem
              key={f.id}
              file={f}
              onRemove={removeFile}
              onAssetDone={markAssetDone}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
