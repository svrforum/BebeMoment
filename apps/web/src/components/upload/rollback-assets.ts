/**
 * 스토리 제출이 실패했을 때, 그 제출을 위해 이미 올라간 사진들을 되돌린다.
 *
 * 스토리는 사진의 assetId 를 참조하므로 업로드가 먼저 일어날 수밖에 없다. 그래서 스토리
 * 생성이 실패하면 사진만 타임라인에 개별로 남았다 — 쓴 적 없는 스토리의 사진들이 흩어져
 * 있는 셈이라, 사용자가 손으로 하나씩 지워야 했다.
 *
 * 완전 삭제가 아니라 휴지통으로 보낸다(같은 `POST /api/asset/<id>/delete`). 타임라인에서
 * 사라지되 되살릴 수 있어야, 이 되돌림 자체가 사진을 잃는 사고가 되지 않는다.
 *
 * 되돌림도 실패할 수 있다(네트워크가 이미 끊긴 상황일 수 있다). 그래서 결과를 세어
 * 돌려주고, 호출부는 남은 게 있으면 사용자에게 숨기지 말고 알린다(§조용한 실패 금지).
 */
export async function rollbackAssets(
  assetIds: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<{ removed: number; failed: string[] }> {
  const results = await Promise.all(
    assetIds.map(async (id) => {
      try {
        const res = await fetchImpl(`/api/asset/${id}/delete`, { method: 'POST' })
        return res.ok ? null : id
      } catch {
        return id
      }
    }),
  )
  const failed = results.filter((r): r is string => r !== null)
  return { removed: assetIds.length - failed.length, failed }
}
