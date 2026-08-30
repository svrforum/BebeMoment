/**
 * 이 배치에서 **서버에 실제로 만들어진** 자산 id 만 추린다(assetId = init 통과).
 *
 * ⚠️ 업로드를 중단하기 **전에** 불러야 한다. 중단은 uppy 의 파일 목록을 비우므로, 그
 * 뒤에 부르면 언제나 빈 배열이 나와 되돌리기가 조용히 아무것도 하지 않는다.
 */
export function createdAssetIds(
  files: readonly { id: string; meta?: { assetId?: string } }[],
  fileIds: readonly string[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const fid of fileIds) {
    const id = files.find((f) => f.id === fid)?.meta?.assetId
    if (typeof id === 'string' && !seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out
}
