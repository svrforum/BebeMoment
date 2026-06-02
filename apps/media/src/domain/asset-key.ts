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
