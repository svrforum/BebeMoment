'use client'
import { isOptimizeEnabled, optimizeImage } from '@/lib/image-optimize'
import { useFamilySSE } from '@/lib/sse'
import { useToast } from '@/lib/toast'
import type { UppyFile } from '@uppy/core'
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
  upload?: () => Promise<unknown>
}

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024

export type UploadManager = {
  files: FileRow[]
  doneIds: Set<string>
  addFiles: (list: FileList | File[]) => Promise<string[]>
  removeFile: (id: string) => void
  markAssetDone: (assetId: string) => void
  startStagedUploads: () => void
  replaceFileData: (id: string, blob: Blob) => void
  hasStaged: boolean
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
  const [files, setFiles] = useState<FileRow[]>([])
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const [uppy, setUppy] = useState<UppyInstance | null>(null)
  const initLock = useRef<Promise<UppyInstance> | null>(null)

  const initUppy = useCallback(async (): Promise<UppyInstance> => {
    if (uppy) return uppy
    if (initLock.current) return initLock.current

    const promise = (async () => {
      // Wipe any leftover tus resume entries from previous sessions before
      // wiring up Uppy. Even with storeFingerprintForResuming:false set,
      // tus-js-client still *reads* old entries from localStorage on
      // startup; if the partial upload no longer exists server-side the
      // HEAD request 403s and Uppy logs a misleading "cannot resume"
      // error. Cheap to do once; the rest of the session writes nothing.
      if (typeof window !== 'undefined') {
        try {
          const stale = Object.keys(window.localStorage).filter((k) => k.startsWith('tus::'))
          for (const k of stale) window.localStorage.removeItem(k)
        } catch {
          // Private mode / storage disabled — nothing to clean.
        }
      }

      const [{ default: UppyCtor }, { default: Tus }] = await Promise.all([
        import('@uppy/core'),
        import('@uppy/tus'),
      ])
      const u = new UppyCtor({
        restrictions: {
          maxFileSize: MAX_FILE_SIZE,
          allowedFileTypes: ['image/*', 'video/*'],
        },
        autoProceed: false,
        // Uppy 기본 영문 제한 메시지를 한국어로(중복 파일·크기·형식).
        locale: {
          strings: {
            noDuplicates: "이미 추가된 파일이에요: '%{fileName}'",
            exceedsSize: '파일이 너무 커요',
            youCanOnlyUploadFileTypes: '이미지·영상만 올릴 수 있어요',
          },
          // biome-ignore lint/suspicious/noExplicitAny: Uppy locale partial-strings type is awkward across the dynamic import
        } as any,
      }).use(Tus, {
        chunkSize: 8 * 1024 * 1024,
        retryDelays: [0, 1000, 3000, 5000],
        // We always create a fresh upload via startUpload server action.
        // localStorage-based resume of a previous session's URL has caused
        // 403s when the partial upload had been cleaned up server-side
        // ("unable to resume upload"). Disable fingerprint persistence —
        // for our typical 1MB-50MB files the resume value is marginal,
        // and a clean re-upload is far less confusing than a stuck error.
        storeFingerprintForResuming: false,
        removeFingerprintOnSuccess: true,
        // Uppy's generic headers signature is awkward across the
        // dynamic-import boundary, so the function is cast below.
        headers: ((file: { meta?: UppyFileMeta }) => {
          const token = file.meta?.uploadToken
          return token ? { authorization: `Bearer ${token}` } : {}
          // biome-ignore lint/suspicious/noExplicitAny: Uppy's loose header-fn signature across the dynamic-import boundary
        }) as any,
      })

      u.addPreProcessor(async (fileIDs: string[]) => {
        await Promise.all(
          fileIDs.map(async (id) => {
            let file = u.getFile(id) as unknown as FileRow | undefined
            if (!file || file.meta?.uploadToken) return
            // 클라이언트 최적화(설정 ON + 이미지) — startUpload(init) 전에 파일을 교체해
            // init 이 줄어든 크기/타입을 받고 tus 가 최적화 바이트를 올린다.
            if (
              isOptimizeEnabled() &&
              file.data instanceof Blob &&
              (file.type ?? '').startsWith('image/')
            ) {
              try {
                const asFile =
                  file.data instanceof File
                    ? file.data
                    : new File([file.data], file.name ?? `upload-${id}`, { type: file.type })
                const optimized = await optimizeImage(asFile)
                if (
                  optimized !== asFile &&
                  optimized.size < (file.size ?? Number.POSITIVE_INFINITY)
                ) {
                  u.setFileState(id, {
                    data: optimized,
                    size: optimized.size,
                    type: optimized.type,
                    name: optimized.name,
                  })
                  u.setFileMeta(id, { name: optimized.name })
                  file = u.getFile(id) as unknown as FileRow | undefined
                  if (!file) return
                }
              } catch {
                // 최적화 실패 — 원본 그대로 업로드.
              }
            }
            if (!file) return
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
      // biome-ignore lint/suspicious/noExplicitAny: Uppy's event signature differs across module reload boundaries
      u.on('upload-error', onError as any)
      // biome-ignore lint/suspicious/noExplicitAny: same as upload-error above
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
  // starts clean and the floating pill disappears. Note: we don't call
  // router.refresh() here — TimelineGrid's SSE handler already debounces a
  // refresh after the last asset settles, so doing it again would just
  // cause a second flicker.
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
    }, 700)
    return () => clearTimeout(t)
  }, [files, doneIds, uppy])

  const addFiles = useCallback(
    async (list: FileList | File[]): Promise<string[]> => {
      // Snapshot to a plain array BEFORE the await — FileList is live-bound
      // to the <input>, and the caller (onPick) clears `input.value = ''`
      // synchronously after kicking off this async function. By the time
      // we resume after `await initUppy()`, the original FileList is empty.
      const arr = Array.from(list)
      let u: UppyInstance
      try {
        u = await initUppy()
      } catch (e) {
        toast({
          title: '업로더 초기화 실패',
          description: (e as Error).message,
          variant: 'danger',
        })
        return []
      }
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

  // initUppy() (not the `uppy` state) so this works even on the very first
  // upload of a session: when a caller does `addFiles(...)` then
  // `startStagedUploads()` in the same handler, `setUppy()` hasn't
  // re-rendered yet, so the `uppy` state closure is still null. The cached
  // instance from initUppy()/initLock is the source of truth.
  const startStagedUploads = useCallback(() => {
    void (async () => {
      const u = uppy ?? (await initUppy())
      await u.upload?.()
    })()
  }, [uppy, initUppy])

  const replaceFileData = useCallback(
    (id: string, blob: Blob) => {
      uppy?.setFileState(id, { data: blob, size: blob.size })
      if (uppy) setFiles(uppy.getFiles() as unknown as FileRow[])
    },
    [uppy],
  )

  const value = useMemo<UploadManager>(() => {
    let uploading = 0
    let processing = 0
    for (const f of files) {
      const started = Boolean(f.progress?.uploadStarted)
      const complete = f.progress?.uploadComplete ?? false
      const id = f.meta?.assetId
      if (started && !complete) uploading++
      else if (complete && id && !doneIds.has(id)) processing++
    }
    const hasStaged = files.some((f) => !f.progress?.uploadStarted)
    return {
      files,
      doneIds,
      addFiles,
      removeFile,
      markAssetDone,
      startStagedUploads,
      replaceFileData,
      hasStaged,
      uploadingCount: uploading,
      processingCount: processing,
      totalActive: uploading + processing,
    }
  }, [files, doneIds, addFiles, removeFile, markAssetDone, startStagedUploads, replaceFileData])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
