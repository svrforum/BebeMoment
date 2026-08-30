/**
 * 업로드 매니저가 더는 들고 있지 않은 첨부(죽은 fileId)를 갈라낸다.
 *
 * 업로드가 끝나면 자동정리가 uppy 파일을 치우는데, 컴포저·편집 화면은 자기 첨부 목록을
 * 따로 들고 있어 그대로 남는다. 그 상태로 다시 "올리기"를 누르면 시작할 파일이 없어
 * 같은 에러만 반복되고 빠져나갈 방법이 없다 — 실패했을 때 이걸로 걸러내고 사용자에게
 * 다시 담아야 한다고 알린다.
 */
export function partitionStaleAttachments<T extends { fileId: string }>(
  files: readonly { id: string }[],
  attachments: readonly T[],
): { live: T[]; staleCount: number } {
  const alive = new Set(files.map((f) => f.id))
  const live = attachments.filter((a) => alive.has(a.fileId))
  return { live, staleCount: attachments.length - live.length }
}
