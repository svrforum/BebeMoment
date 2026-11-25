import { collectAssetIds } from './collect-asset-ids'
import { createdAssetIds } from './created-asset-ids'
import { reportUploadFailure } from './report-failure'
import { rollbackAssets } from './rollback-assets'

type FileLike = { id: string; meta?: { assetId?: string } }
type Translate = (key: string, values?: Record<string, string | number>) => string

export type StorySubmitFlow = 'upload-sheet' | 'timeline-composer' | 'story-edit'

/** 실패 문구(`uploadNotReady`·`rolledBack`·`rolledBackPartly`·`reattach`)를 읽는 네임스페이스. */
export const STORY_SUBMIT_NAMESPACE = {
  'upload-sheet': 'upload',
  'timeline-composer': 'timeline.composer',
  'story-edit': 'story.edit',
} as const satisfies Record<StorySubmitFlow, string>

const SAVE_STEP = {
  'upload-sheet': 'story-post',
  'timeline-composer': 'story-post',
  'story-edit': 'story-patch',
} as const satisfies Record<StorySubmitFlow, string>

/** 업로드 매니저에서 제출이 쓰는 부분. `readFiles` 는 최신 목록(보통 매 렌더 갱신되는 ref). */
export type StorySubmitUploads = {
  readFiles: () => FileLike[]
  startStagedUploads: (opts: { notify: boolean }) => void
  abortUploads: (fileIds: readonly string[]) => Promise<void>
  pauseAutoDismiss: (paused: boolean) => void
}

export type StorySubmitIo = {
  collect: typeof collectAssetIds
  rollback: typeof rollbackAssets
  report: typeof reportUploadFailure
}

const DEFAULT_IO: StorySubmitIo = {
  collect: collectAssetIds,
  rollback: rollbackAssets,
  report: reportUploadFailure,
}

export type StorySubmitJob<T> = {
  /** 이번에 새로 담은 사진의 fileId, 화면에 보이는 순서대로. */
  fileIds: readonly string[]
  /** 사진을 올리기 전에 막을 입력 오류(날짜 등). 있으면 아무것도 시작하거나 지우지 않는다. */
  invalid?: string | null
  /** fileIds 순서의 assetId 로 스토리를 저장한다. 실패하면 사용자에게 보일 문구로 throw. */
  save: (assetIds: string[]) => Promise<T>
}

export type StorySubmitFailure = {
  ok: false
  message: string
  rolledBack: number
  rollbackFailed: number
  /** 매니저에서 빠져 다시 올릴 수 없게 된 첨부(fileId) — 화면의 첨부 목록에서도 걷어 내야 한다. */
  dropped: string[]
}

export type StorySubmitResult<T> = { ok: true; saved: T } | StorySubmitFailure

/**
 * 사진이 딸린 스토리 제출(업로드 시트·타임라인 컴포저·스토리 편집 공용): 담아 둔 사진을 올리고, assetId 가
 * 모이면 저장한다. 저장이 실패하면 스토리 없이 사진만 타임라인에 흩어지지 않게 이번에 올린
 * 사진을 휴지통으로 되돌리고, 무엇이 어디서 끊겼는지 진단 로그로 보낸다.
 */
export async function submitStory<T>(
  job: StorySubmitJob<T> & { flow: StorySubmitFlow; notReadyMessage: string },
  uploads: StorySubmitUploads,
  io: StorySubmitIo = DEFAULT_IO,
): Promise<StorySubmitResult<T>> {
  if (job.invalid)
    return { ok: false, message: job.invalid, rolledBack: 0, rollbackFailed: 0, dropped: [] }

  const fileIds = [...job.fileIds]
  // 제출이 끝날 때까지 자동정리를 멈춘다 — 사진이 빨리 처리되면 assetId 를 모으기도 전에
  // 매니저가 파일 목록을 비워 "업로드 준비가 끝나지 않았어요"만 반복된다.
  uploads.pauseAutoDismiss(true)
  try {
    // notify:false — 개별 '사진 추가' 푸시 대신 스토리가 보내는 푸시 하나로 갈음한다.
    if (fileIds.length > 0) uploads.startStagedUploads({ notify: false })
    let step: 'collect-asset-ids' | (typeof SAVE_STEP)[StorySubmitFlow] = 'collect-asset-ids'
    try {
      const assetIds = await io.collect(uploads.readFiles, fileIds)
      if (assetIds.length !== fileIds.length) throw new Error(job.notReadyMessage)
      step = SAVE_STEP[job.flow]
      return { ok: true, saved: await job.save(assetIds) }
    } catch (e) {
      const message = (e as Error).message
      // 스냅샷이 먼저 — 중단이 이 배치를 매니저의 파일 목록에서 지운다.
      const before = uploads.readFiles()
      const created = createdAssetIds(before, fileIds)
      // 중단 전에 이미 매니저에 없던 첨부(다른 흐름이 치운 것). 시작할 파일이 없어 수집이
      // 끝까지 기다리다 'uploadNotReady' 로 끝나는 경우를 재현 없이 가려 주는 숫자다.
      const live = new Set(before.map((f) => f.id))
      const stale = fileIds.filter((id) => !live.has(id)).length
      await uploads.abortUploads(fileIds)
      const undone = created.length > 0 ? await io.rollback(created) : null
      // 중단으로 배치 전체가 매니저에서 빠졌으니 화면의 첨부도 전부 다시 담아야 한다. 매니저
      // 목록을 다시 읽어 가르지 않는다 — ref 는 다음 렌더에야 바뀌어서, 지운 파일이 아직 살아
      // 있는 것처럼 보일 수 있고 그러면 첨부가 죽은 채 남는다.
      const dropped = fileIds
      void io.report({
        flow: job.flow,
        step,
        message,
        counts: {
          staged: fileIds.length,
          created: created.length,
          rolledBack: undone?.removed ?? 0,
          rollbackFailed: undone?.failed.length ?? 0,
          stale,
        },
        ...(undone?.failed.length ? { assetIds: undone.failed } : {}),
      })
      return {
        ok: false,
        message,
        rolledBack: undone?.removed ?? 0,
        rollbackFailed: undone?.failed.length ?? 0,
        dropped,
      }
    }
  } finally {
    // 성공해도 반드시 푼다 — 편집 화면은 저장하면 떠나 버려서, 안 풀면 자동정리가 멈춘 채로
    // 남아 다음 업로드의 완료 카드가 사라지지 않는다.
    uploads.pauseAutoDismiss(false)
  }
}

/** 실패 토스트 제목. `t` 는 그 흐름의 `STORY_SUBMIT_NAMESPACE` 로 바인딩된 번역 함수. */
export function storySubmitFailureTitle(f: StorySubmitFailure, t: Translate): string {
  if (f.rollbackFailed > 0)
    return t('rolledBackPartly', { count: f.rollbackFailed, error: f.message })
  if (f.rolledBack > 0) return t('rolledBack', { count: f.rolledBack, error: f.message })
  if (f.dropped.length > 0) return t('reattach', { count: f.dropped.length, error: f.message })
  return f.message
}
