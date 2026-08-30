/**
 * 휴지통에서 고른 사진들을 영구 삭제한다.
 *
 * 되돌릴 수 없는 작업이라 한 건씩 차례로 처리한다 — 파일 삭제를 한꺼번에 몰아치면
 * 스토리지가 느린 환경(NAS)에서 타임아웃이 나고, 어디까지 지워졌는지도 알 수 없다.
 * 한 장이 실패해도 멈추지 않고 끝까지 간 뒤 실패한 것만 돌려준다 — 멈춰버리면 사용자는
 * 무엇이 남았는지 모른 채 전체선택을 다시 눌러야 한다.
 */
export async function purgeMany(
  assetIds: readonly string[],
  purge: (assetId: string) => Promise<void>,
): Promise<{ purged: number; failed: { assetId: string; error: string }[] }> {
  const seen = new Set<string>()
  const failed: { assetId: string; error: string }[] = []
  let purged = 0
  for (const id of assetIds) {
    if (seen.has(id)) continue
    seen.add(id)
    try {
      await purge(id)
      purged += 1
    } catch (e) {
      failed.push({ assetId: id, error: (e as Error).message.slice(0, 200) })
    }
  }
  return { purged, failed }
}
