'use client'
import { useFamilySSE } from '@/lib/sse'
import { useToast } from '@/lib/toast'
import type { UppyFile } from '@uppy/core'
import { useRouter } from 'next/navigation'
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { startUpload } from './actions'

export type UppyFileMeta = { uploadToken?: string; assetId?: string }
export type UppyBody = { xhr: XMLHttpRequest }
export type FileRow = UppyFile<UppyFileMeta, UppyBody>

// Use a structural type so we don't carry the full @uppy/core surface area
// in modules that just want to call a few methods.
type UppyInstance = {
  addFile: (file: { name: string; type: string; data: File }) => string
  removeFile: (id: string) => void
  cancelAll: () => void
  getFiles: () => unknown[]
  setFileMeta: (id: string, meta: Record<string, unknown>) => void
  setFileState: (id: string, state: Record<string, unknown>) => void
  on: (event: string, cb: (...args: unknown[]) => void) => void
  off: (event: string, cb: (...args: unknown[]) => void) => void
  getFile: (id: string) => unknown
  addPreProcessor: (fn: (ids: string[]) => Promise<void>) => void
}

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024

export type UploadManager = {
  files: FileRow[]
  doneIds: Set<string>
  addFiles: (list: FileList | File[]) => Promise<string[]>
  removeFile: (id: string) => void
  markAssetDone: (assetId: string) => void
  uploadingCount: number
  processingCount: number
  totalActive: number
}

const Ctx = createContext<UploadManager | null>(null)

export function useUploadManager(): UploadManager {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useUploadManager must be inside UploadManagerProvider')
  return ctx
}

/**
 * Provider that owns the (lazy) Uppy instance.
 *
 * Why lazy: @uppy/core + @uppy/tus are ~200KB on the wire and used only
 * when the user actually picks a file. Eagerly loading them on every page
 * blew up the initial chunk. Now they're imported on first addFiles call
 * via a dynamic import; the Uppy instance is built once and cached for
 * the lifetime of the session.
 *
 * Listeners + sync hooks attach when the instance materializes, so React
 * still mirrors Uppy state correctly.
 */
export function UploadManagerProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const router = useRouter()
  const [files, setFiles] = useState<FileRow[]>([])
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const [uppy, setUppy] = useState<UppyInstance | null>(null)
  const initLock = useRef<Promise<UppyInstance> | null>(null)

  const initUppy = useCallback(async (): Promise<UppyInstance> => {
    if (uppy) return uppy
    if (initLock.current) return initLock.current

    const promise = (async () => {
      const [{ default: UppyCtor }, { default: Tus }] = await Promise.all([
        import('@uppy/core'),
        import('@uppy/tus'),
      ])
      const u = new UppyCtor({
        restrictions: {
          maxFileSize: MAX_FILE_SIZE,
          allowedFileTypes: ['image/*', 'video/*'],
        },
        autoProceed: true,
      }).use(Tus, {
        chunkSize: 8 * 1024 * 1024,
        retryDelays: [0, 1000, 3000, 5000],
        // biome-ignore lint/suspicious/noExplicitAny: Uppy's generic headers
        // signature is awkward across the dynamic-import boundary
        headers: ((file: { meta?: UppyFileMeta }) => {
          const token = file.meta?.uploadToken
          return token ? { authorization: `Bearer ${token}` } : {}
          // biome-ignore lint/suspicious/noExplicitAny: same as above
        }) as any,
      })

      u.addPreProcessor(async (fileIDs: string[]) => {
        await Promise.all(
          fileIDs.map(async (id) => {
            const file = u.getFile(id) as unknown as FileRow | undefined
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

      const sync = () => setFiles(u.getFiles() as unknown as FileRow[])
      sync()
      u.on('file-added', sync)
      u.on('file-removed', sync)
      u.on('upload-progress', sync)
      u.on('upload-success', sync)
      u.on('upload-error', sync)
      u.on('preprocess-complete', sync)

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
      // biome-ignore lint/suspicious/noExplicitAny: Uppy's strict event
      // signature differs across module reload boundaries; cast to unblock.
      u.on('upload-error', onError as any)
      // biome-ignore lint/suspicious/noExplicitAny: same
      u.on('restriction-failed', onRestrictionFailed as any)

      if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
        ;(window as unknown as { __uppy?: unknown }).__uppy = u
      }

      const instance = u as unknown as UppyInstance
      setUppy(instance)
      return instance
    })()

    initLock.current = promise
    return promise
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
  // mounts. SSE itself is the shared single-connection variant.
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
    if (!uppy || files.length === 0) return
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
    async (list: FileList | File[]): Promise<string[]> => {
      const u = await initUppy()
      const arr = Array.from(list)
      const ids: string[] = []
      for (const f of arr) {
        try {
          const id = u.addFile({ name: f.name, type: f.type, data: f })
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
    [initUppy, toast],
  )

  const removeFile = useCallback((id: string) => uppy?.removeFile(id), [uppy])

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
