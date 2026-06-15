type FileLike = { id: string; meta?: { assetId?: string } }

/**
 * 스테이징한 파일들이 업로드 시작(init)으로 assetId 를 받을 때까지 기다렸다가, 모인
 * assetId 들을 돌려준다. 타임라인 컴포저·스토리 편집·업로드 시트의 스토리 제출이 모두
 * 같은 폴링을 하던 것을 하나로 모은 것(DRY). 모두 모이면 즉시 반환, 기한을 넘기면 그때까지
 * 모인 것만 반환한다(호출부가 부족분을 판단). `read` 는 최신 파일 목록 getter(보통 ref).
 */
export async function collectAssetIds(
  read: () => FileLike[],
  fileIds: string[],
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<string[]> {
  const deadline = Date.now() + (opts.timeoutMs ?? 30_000)
  const interval = opts.intervalMs ?? 200
  const resolve = (): string[] =>
    fileIds
      .map((fid) => read().find((f) => f.id === fid)?.meta?.assetId)
      .filter((id): id is string => typeof id === 'string')
  while (Date.now() < deadline && resolve().length < fileIds.length) {
    await new Promise((r) => setTimeout(r, interval))
  }
  return resolve()
}
