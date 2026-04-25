'use client'
import { useFamilySSE } from '@/lib/sse'
import { useToast } from '@/lib/toast'
import Uppy, { type UppyFile } from '@uppy/core'
import Tus from '@uppy/tus'
import { useRouter } from 'next/navigation'
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { startUpload } from './actions'

export type UppyFileMeta = { uploadToken?: string; assetId?: string }
export type UppyBody = { xhr: XMLHttpRequest }
export type FileRow = UppyFile<UppyFileMeta, UppyBody>

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024

export type UploadManager = {
  files: FileRow[]
  doneIds: Set<string>
  /** Returns the Uppy file IDs of newly added files so callers (e.g. the
   *  timeline composer) can track this specific batch through the manager's
   *  shared state. */
  addFiles: (list: FileList | File[]) => string[]
  removeFile: (id: string) => void
  markAssetDone: (assetId: string) => void
  /** Files still uploading bytes (tus PATCH in flight). */
  uploadingCount: number
  /** Files whose tus is done but worker hasn't finished processing yet. */
  processingCount: number
  /** Files in the queue at all (excluding already-cleared "all done" runs). */
  totalActive: number
}

const Ctx = createContext<UploadManager | null>(null)

export function useUploadManager(): UploadManager {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useUploadManager must be inside UploadManagerProvider')
  return ctx
}

export function UploadManagerProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const router = useRouter()
  const [files, setFiles] = useState<FileRow[]>([])
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())

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
      // Parallel /assets/init calls — independent server actions.
      await Promise.all(
        fileIDs.map(async (id) => {
          const file = u.getFile(id)
          if (!file || file.meta?.uploadToken) return
          const init = await startUpload({
            mime: file.type ?? 'application/octet-stream',
            sizeBytes: file.size ?? 0,
            originalName: file.name ?? `upload-${id}`,
          })
          u.setFileMeta(id, { uploadToken: init.uploadToken, assetId: init.assetId })
          u.setFileState(id, { tus: { uploadUrl: init.tusUploadUrl } })
        }),
      )
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

  const markAssetDone = useCallback((assetId: string) => {
    setDoneIds((prev) => {
      if (prev.has(assetId)) return prev
      const next = new Set(prev)
      next.add(assetId)
      return next
    })
  }, [])

  // Family-wide SSE drives auto-dismiss too — covers the race where the
  // worker finishes processing before a per-asset UploadProgressBar even
  // mounts (typical for small images on a fast LAN).
  useFamilySSE(
    useCallback(
      (event) => {
        if (
          event.type === 'asset.updated' &&
          (event.status === 'ready' || event.status === 'failed')
        ) {
          markAssetDone(event.assetId)
        }
      },
      [markAssetDone],
    ),
  )

  // When every queued file finishes processing, flush state so a fresh batch
  // starts clean and the floating pill disappears.
  useEffect(() => {
    if (files.length === 0) return
    const allHaveAsset = files.every((f) => f.meta?.assetId)
    if (!allHaveAsset) return
    const allDone = files.every((f) => {
      const id = f.meta?.assetId
      return id ? doneIds.has(id) : false
    })
    if (!allDone) return
    const t = setTimeout(() => {
      uppy.cancelAll()
      setDoneIds(new Set())
      router.refresh()
    }, 700)
    return () => clearTimeout(t)
  }, [files, doneIds, uppy, router])

  const addFiles = useCallback(
    (list: FileList | File[]): string[] => {
      const arr = Array.from(list)
      const ids: string[] = []
      for (const f of arr) {
        try {
          const id = uppy.addFile({ name: f.name, type: f.type, data: f })
          if (typeof id === 'string') ids.push(id)
        } catch (e) {
          toast({
            title: `${f.name} 추가 실패`,
            description: (e as Error).message,
            variant: 'danger',
          })
        }
      }
      return ids
    },
    [uppy, toast],
  )

  const removeFile = useCallback((id: string) => uppy.removeFile(id), [uppy])

  const value = useMemo<UploadManager>(() => {
    let uploading = 0
    let processing = 0
    for (const f of files) {
      const complete = f.progress?.uploadComplete ?? false
      const id = f.meta?.assetId
      if (!complete) uploading++
      else if (id && !doneIds.has(id)) processing++
    }
    return {
      files,
      doneIds,
      addFiles,
      removeFile,
      markAssetDone,
      uploadingCount: uploading,
      processingCount: processing,
      totalActive: uploading + processing,
    }
  }, [files, doneIds, addFiles, removeFile, markAssetDone])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
