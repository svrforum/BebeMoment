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
  /** 아직 업로드를 시작하지 않은(staged) 파일을 모두 Uppy 에서 제거. 시트·컴포저를
   *  닫거나 취소할 때 호출 — 잔존 staged 파일이 다음 선택에서 Uppy 의 noDuplicates
   *  로 막히는 것을 막는다. 진행 중(started) 업로드는 건드리지 않는다(백그라운드 보존). */
  clearStaged: () => void
  markAssetDone: (assetId: string) => void
  /** opts.notify=false 면 이 배치 사진들의 개별 'asset.uploaded' 푸시를 생략한다
   *  (스토리 첨부 — 스토리 푸시 하나로 갈음). 기본 true. */
  startStagedUploads: (opts?: { notify?: boolean }) => void
  replaceFileData: (id: string, blob: Blob) => void
  /** 비동기 제출 중 자동정리(cancelAll) 일시중지 — 스테이징 파일 보호용. */
  pauseAutoDismiss: (paused: boolean) => void
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
  // 스토리 제출처럼 assetId 를 비동기로 모은 뒤 POST 하는 흐름 중에는 자동정리
  // (cancelAll)를 멈춰 스테이징 파일이 사라지지 않게 한다(POST 실패 후 재시도 보호).
  const [autoDismissPaused, setAutoDismissPaused] = useState(false)
  const initLock = useRef<Promise<UppyInstance> | null>(null)
  // 현재 배치의 푸시 여부 — startStagedUploads(opts) 가 세팅, 프리프로세서의
  // startUpload 가 읽는다(스토리 첨부 업로드는 false → 개별 사진 푸시 생략).
  const notifyRef = useRef(true)

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
        // 같은 오리진의 tus 엔드포인트. 평소엔 init 이 미리 등록한 per-file uploadUrl 로
        // resume(HEAD) 하지만, 그게 404(만료·재시작 등)면 endpoint 로 새로 POST 생성해
        // 회복한다. 서버 namingFunction 이 토큰의 assetId 로 이름지어 완료가 정상 동작.
        endpoint: `${window.location.origin}/media/v1/tus`,
        chunkSize: 8 * 1024 * 1024,
        // 동시 업로드 4개로 제한. HTTP/1.1 은 오리진당 ~6 연결뿐인데, 대량 배치에서
        // 사진마다 tus PATCH + 진행률 SSE 가 연결을 잡으면 한계를 넘겨 업로드·진행바가
        // 멈췄다(사진당 EventSource — 추후 단일 멀티플렉스 스트림으로 개선 예정).
        limit: 4,
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
              notify: notifyRef.current,
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
    if (!uppy || files.length === 0 || autoDismissPaused) return
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
  }, [files, doneIds, uppy, autoDismissPaused])

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

  const clearStaged = useCallback(() => {
    if (!uppy) return
    for (const f of uppy.getFiles() as unknown as FileRow[]) {
      // assetId 가 있으면 이미 업로드에 커밋된 파일(preprocessor 의 init 통과). 제출
      // 직후엔 assetId 는 잡혔지만 uploadStarted 가 아직 false 인 레이스 윈도우가 있어
      // uploadStarted 만 보면 업로드 직전 파일을 abort 한다 — assetId 도 함께 본다.
      if (!f.progress?.uploadStarted && !f.meta?.assetId) uppy.removeFile(f.id)
    }
  }, [uppy])

  // initUppy() (not the `uppy` state) so this works even on the very first
  // upload of a session: when a caller does `addFiles(...)` then
  // `startStagedUploads()` in the same handler, `setUppy()` hasn't
  // re-rendered yet, so the `uppy` state closure is still null. The cached
  // instance from initUppy()/initLock is the source of truth.
  const startStagedUploads = useCallback(
    (opts?: { notify?: boolean }) => {
      notifyRef.current = opts?.notify ?? true
      void (async () => {
        const u = uppy ?? (await initUppy())
        await u.upload?.()
      })()
    },
    [uppy, initUppy],
  )

  const replaceFileData = useCallback(
    (id: string, blob: Blob) => {
      if (!uppy) return
      // 편집기는 항상 JPEG 를 렌더한다 — type/name 도 JPEG 로 맞춰야 init(assets/init)
      // 이 올바른 mime/확장자를 받는다(바이트만 바꾸고 type 을 두면 원본 mime 으로 오라벨).
      const cur = uppy.getFile(id) as unknown as FileRow | undefined
      const jpgName = `${(cur?.name ?? 'edited').replace(/\.[^./\\]+$/, '')}.jpg`
      uppy.setFileState(id, { data: blob, size: blob.size, type: 'image/jpeg', name: jpgName })
      uppy.setFileMeta(id, { name: jpgName })
      setFiles(uppy.getFiles() as unknown as FileRow[])
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
      clearStaged,
      markAssetDone,
      startStagedUploads,
      replaceFileData,
      pauseAutoDismiss: setAutoDismissPaused,
      hasStaged,
      uploadingCount: uploading,
      processingCount: processing,
      totalActive: uploading + processing,
    }
  }, [
    files,
    doneIds,
    addFiles,
    removeFile,
    clearStaged,
    markAssetDone,
    startStagedUploads,
    replaceFileData,
  ])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
