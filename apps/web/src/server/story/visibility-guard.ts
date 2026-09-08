import { ForbiddenError } from '@/server/error'
import type { Role } from '@bebe/core'

/**
 * 스토리 가시성(공개/보호자만)은 보호자만 바꿀 수 있다.
 *
 * 앨범의 비밀 토글은 서버에서 막는데(`album/update.ts`) 스토리는 클라이언트의
 * `canPostGuardian` 뿐이었다. `record.create` 를 받은 family 역할이 API 로 직접
 * `visibility:'guardians'` 를 보내면 그 사진들이 `listSecretAssetIds` 를 통해 family 역할
 * 전체에게서 사라진다 — 한 요청으로 라이브러리를 통째로 숨길 수 있었다.
 *
 * 방향이 무엇이든(공개로 되돌리는 것 포함) family 역할의 **변경**은 거부한다. 되돌리는 방향을
 * 열어두면 보호자가 비밀로 바꾼 스토리를 작성자가 다시 열 수 있어 가드가 반쪽이 된다.
 * 다만 현재 값과 같은 값은 변경이 아니다 — 편집 폼은 가시성을 그대로 되보내므로, 그것까지
 * 거부하면 family 편집자는 본문 한 줄도 못 고친다(모든 저장이 403 이던 회귀).
 */
export function assertCanSetStoryVisibility(
  role: Role,
  visibility: string | undefined,
  current: string,
): void {
  if (visibility === undefined || visibility === current) return
  if (role === 'family') throw new ForbiddenError('story.visibilityGuardianOnly')
}
