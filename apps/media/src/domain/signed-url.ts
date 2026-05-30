import { signFileServeToken } from '@/lib/jwt'

export type SignedUrlArgs = {
  familyId: string
  assetId: string
  key: string
}

export async function buildSignedUrl(args: SignedUrlArgs): Promise<string> {
  // 기본은 **상대 경로** — 브라우저가 현재 오리진(IP든 도메인이든)에 대해 해석하므로
  // 단일 포트 `/media/*` rewrite 와 함께 어떤 접속 경로에서도 동작하고, https 도메인에서
  // http IP URL 이 섞여 막히는 mixed-content 문제도 없다. 미디어를 별도 호스트로 분리한
  // 경우에만 MEDIA_PUBLIC_BASE_URL 로 절대 URL 을 강제한다. (PUBLIC_URL 폴백은 제거 —
  // IP/스킴 불일치로 원격 도메인 사용자에게 이미지가 안 뜨는 회귀를 유발했다.)
  const base = (process.env.MEDIA_PUBLIC_BASE_URL || '').replace(/\/$/, '')
  const token = await signFileServeToken(args)
  return `${base}/media/v1/files/${token}`
}
