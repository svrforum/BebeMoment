/**
 * 재시도를 걸어도 소용없는 상태인지.
 *
 * 재처리는 원본 바이트를 다시 읽는다. 업로드가 중간에 끊겨 원본이 저장되지 않았거나
 * 방치된 임시 파일이 정리된 뒤라면, 재시도는 매번 같은 ENOENT 로 끝난다 — 그런데 화면에는
 * 그냥 '실패'로 보여서 사용자는 계속 누른다. 그 경우를 미리 구분해 "다시 올려주세요"라고
 * 말할 수 있게 한다.
 */
export function retryFailureReason(input: { originalExists: boolean }): 'original-missing' | null {
  return input.originalExists ? null : 'original-missing'
}
