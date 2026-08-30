type Flow = 'upload-sheet' | 'timeline-composer' | 'story-edit' | 'upload-manager'
type Step =
  | 'collect-asset-ids'
  | 'story-post'
  | 'story-patch'
  | 'rollback'
  | 'init'
  | 'tus'
  | 'restriction'
  | 'unknown'

/**
 * 업로드·스토리 제출 실패를 서버 로그로 넘긴다(진단 전용).
 *
 * 이 실패들은 브라우저 안에서 끝나 서버에 흔적이 없었다 — 사진이 안 올라간 사고를 쫓을
 * 때마다 재현부터 해야 했고, 그때마다 다른 원인이 나왔다. 무엇이 몇 개였고 어디서
 * 끊겼는지만 보낸다(사진·파일명·본문은 보내지 않는다).
 *
 * 절대 던지지 않는다 — 진단이 원래 에러를 덮으면 안 된다.
 */
export async function reportUploadFailure(input: {
  flow: Flow
  step: Step
  message: string
  counts?: {
    staged?: number
    collected?: number
    created?: number
    rolledBack?: number
    rollbackFailed?: number
    stale?: number
  }
  assetIds?: string[]
}): Promise<void> {
  try {
    await fetch('/api/diagnostics/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...input,
        message: input.message.slice(0, 500),
        ...(input.assetIds?.length ? { assetIds: input.assetIds.slice(0, 50) } : {}),
        client:
          typeof navigator !== 'undefined' && /bebeApp\//.test(navigator.userAgent)
            ? 'android-app'
            : 'browser',
      }),
    })
  } catch {
    // 진단 보고 실패는 조용히 넘긴다 — 이미 무언가 잘못된 상황이다.
  }
}
