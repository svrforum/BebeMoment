'use client'
import { ImagePlus, Pencil, Plus, X } from 'lucide-react'
import { type ChangeEvent, type DragEvent, useCallback, useEffect, useRef, useState } from 'react'
import { UploadProgressBar } from './UploadProgressBar'
import { UploadEditor } from './upload-editor'
import { type FileRow, useUploadManager } from './upload-manager'

const EDITABLE = new Set(['image/jpeg', 'image/png', 'image/webp'])

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
  useEffect(() => {
    if (!file.data || !(file.data instanceof Blob)) return
    if (!file.type?.startsWith('image/')) return
    const url = URL.createObjectURL(file.data)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file.data, file.type])

  return src ? (
    <img src={src} alt="" className="h-full w-full rounded-xl object-cover" />
  ) : (
    <div className="flex h-full w-full items-center justify-center rounded-xl bg-base-100 text-[10px] text-base-500 dark:bg-base-800">
      {file.type?.startsWith('video/') ? 'VIDEO' : 'FILE'}
    </div>
  )
}

export function UploadDashboard() {
  const { files, addFiles, removeFile, markAssetDone, startStagedUploads, replaceFileData } =
    useUploadManager()
  const [dragOver, setDragOver] = useState(false)
  const [editing, setEditing] = useState<{ id: string; dataUrl: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
          <button
            type="button"
            onClick={startStagedUploads}
            className="rounded-full bg-point-500 py-3 text-sm font-semibold text-white transition active:scale-95"
          >
            {staged.length}개 업로드
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
