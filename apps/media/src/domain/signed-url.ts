import { signImageAccess } from '@/lib/image-access'
import { signFileServeToken } from '@/lib/jwt'

export type SignedUrlArgs = {
  familyId: string
  assetId: string
  key: string
}

// 기본은 **상대 경로** — 브라우저가 현재 오리진(IP든 도메인이든)에 대해 해석하므로
// 단일 포트 `/media/*` rewrite 와 함께 어떤 접속 경로에서도 동작하고, https 도메인에서
// http IP URL 이 섞여 막히는 mixed-content 문제도 없다. 미디어를 별도 호스트로 분리한
// 경우에만 MEDIA_PUBLIC_BASE_URL 로 절대 URL 을 강제한다. (PUBLIC_URL 폴백은 제거 —
// IP/스킴 불일치로 원격 도메인 사용자에게 이미지가 안 뜨는 회귀를 유발했다.)
function publicBase(): string {
  return (process.env.MEDIA_PUBLIC_BASE_URL || '').replace(/\/$/, '')
}

export async function buildSignedUrl(args: SignedUrlArgs): Promise<string> {
  const token = await signFileServeToken(args)
  return `${publicBase()}/media/v1/files/${token}`
}

/**
 * 한 자산의 이미지 파생물 주소를 만드는 함수를 돌려준다 — 서명은 여기서 한 번만 하고,
 * 그 자산의 모든 크기·형식이 같은 토큰을 쓴다(`/media/v1/img/<assetId>/<이름>/<토큰>`).
 * 이름은 호출부가 `imageDerivativeName` 으로 걸러서 넘긴다.
 *
 * 토큰을 맨 뒤에 둔다 — 경로가 `.webp`·`.jpeg` 로 끝나면 확장자로 정적 파일을 골라 캐시하는
 * 프록시 규칙(Cache-Control 을 무시하는 것도 있다)에 걸린다. JWT 주소가 그랬듯 서명으로 끝나면
 * 어떤 프록시에서도 지금까지와 똑같이 지나간다.
 */
export function imageUrlFor(assetId: string): (name: string) => string {
  const prefix = `${publicBase()}/media/v1/img/${assetId}/`
  const token = signImageAccess(assetId)
  return (name) => `${prefix}${name}/${token}`
}
