type FileLike = { id: string; meta?: { assetId?: string } }

/**
 * 스테이징한 파일들이 업로드 시작(init)으로 assetId 를 받을 때까지 기다렸다가, 모인
 * assetId 들을 돌려준다. 타임라인 컴포저·스토리 편집·업로드 시트의 스토리 제출이 모두
 * 같은 폴링을 하던 것을 하나로 모은 것(DRY). 모두 모이면 즉시 반환, 포기하면 그때까지
 * 모인 것만 반환한다(호출부가 부족분을 판단). `read` 는 최신 파일 목록 getter(보통 ref).
 *
 * 포기 기준은 경과 시간이 아니라 **정체**다. 사진을 10장 넘게 고르면 전처리(클라이언트
 * 리사이즈 + init)가 폰에서 수십 초씩 걸리는데, 고정 기한을 두니 정상 동작 중에 기한만
 * 지나 스토리가 실패하고 사진은 개별로 올라가 버렸다. 새 id 가 붙는 동안에는 기다리고,
 * `stallMs` 동안 하나도 안 늘면 그때 끝낸다. `maxMs` 는 영원히 매달리지 않기 위한 천장.
 */
export async function collectAssetIds(
  read: () => FileLike[],
  fileIds: string[],
  opts: { stallMs?: number; maxMs?: number; intervalMs?: number; timeoutMs?: number } = {},
): Promise<string[]> {
  const interval = opts.intervalMs ?? 200
  // timeoutMs 는 옛 호출부 호환 — 주면 그대로 천장으로 쓴다.
  const maxMs = opts.maxMs ?? opts.timeoutMs ?? 300_000
  const stallMs = opts.stallMs ?? 30_000

  const resolve = (): string[] =>
    fileIds
      .map((fid) => read().find((f) => f.id === fid)?.meta?.assetId)
      .filter((id): id is string => typeof id === 'string')

  const startedAt = Date.now()
  let best = resolve()
  let lastProgressAt = startedAt

  while (best.length < fileIds.length) {
    const now = Date.now()
    if (now - startedAt >= maxMs) break
    if (now - lastProgressAt >= stallMs) break
    await new Promise((r) => setTimeout(r, interval))
    const next = resolve()
    if (next.length > best.length) lastProgressAt = Date.now()
    best = next
  }
  return best
}
