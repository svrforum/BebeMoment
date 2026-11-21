/**
 * signed URL(file-serve/download)의 key 가 토큰의 familyId/assetId 에 속하는지 확인한다
 * (IDOR 방어 — mint 측 버그로 다른 자산·가족 바이트가 새지 않게).
 *
 * 두 가지 정상 key 형태를 모두 허용한다:
 *  - 원본·변환본: `families/<familyId>/assets/<assetId>/...`
 *  - 파생물(썸네일·표시·포스터·프리뷰): `derivatives/<assetId>/...`
 *    (파생물 키엔 familyId 가 없어 assetId 로만 결속한다 — 과거 families 접두만 검사해
 *     모든 파생물 URL 이 401 나던 회귀 수정.)
 */
export function keyBelongsToAsset(key: string, familyId: string, assetId: string): boolean {
  return (
    key.startsWith(`families/${familyId}/assets/${assetId}/`) ||
    key.startsWith(`derivatives/${assetId}/`)
  )
}

// 워커가 만드는 이미지 파생물의 파일 이름 전부(jobs/derivative-trios.ts, 영상 포스터).
// 짧은 이미지 주소(`/media/v1/img/<assetId>/<토큰>/<이름>`)의 이름은 서명에 들어가지 않아
// 이 목록이 저장소 키로 가는 유일한 관문이다. 영상(preview.mp4)·원본은 일부러 없다.
const IMAGE_DERIVATIVE_NAME =
  /^(?:(?:thumb256|thumb512|display1080)\.(?:avif|webp|jpeg)|poster\.jpg)$/

export function isImageDerivativeName(name: string): boolean {
  return IMAGE_DERIVATIVE_NAME.test(name)
}

/**
 * 키가 정확히 `derivatives/<assetId>/<이미지 파생물 이름>` 이면 그 이름, 아니면 null.
 * 다른 자산의 파생물을 가리키는 키(중복 자산 행)나 영상·원본에는 짧은 주소를 내주지 않는다.
 */
export function imageDerivativeName(key: string, assetId: string): string | null {
  const prefix = `derivatives/${assetId}/`
  if (!key.startsWith(prefix)) return null
  const name = key.slice(prefix.length)
  return isImageDerivativeName(name) ? name : null
}
