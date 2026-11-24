import { SHARE_SELECTION_MAX } from '@/lib/share-limits'

/**
 * 추억 묶음 하나를 공유 링크로 내보낼 때 담을 사진 — 화면에 보이는 순서 그대로, 비밀 스토리
 * 사진은 빼고, 한 링크가 담을 수 있는 만큼만. 링크는 이 목록으로 고정된다(나중에 그 날짜로
 * 올린 사진이 따라 들어가는 '이 날 공유'와 다르다).
 */
export function memoryShareIds(
  assets: readonly { id: string }[],
  secret: ReadonlySet<string>,
): string[] {
  const ids: string[] = []
  for (const a of assets) {
    if (ids.length === SHARE_SELECTION_MAX) break
    if (!secret.has(a.id)) ids.push(a.id)
  }
  return ids
}
