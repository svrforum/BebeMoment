import { decryptSecret } from '@/lib/crypto'

export type ClientSecretResult = { ok: true; clientSecret: string } | { ok: false }

// 콜백이 프로바이더 시크릿을 현재 SECRET_KEY 로 복호화한다. SECRET_KEY 회전 후 재저장이
// 누락되면 구 키 암호문이 남아 GCM 인증 실패로 throw → 라우트가 잡지 못하면 500 이 된다.
// 여기서 실패를 결과값으로 바꿔 라우트가 우아하게 /login?error 로 되돌릴 수 있게 한다.
export async function tryDecryptClientSecret(
  clientSecretEnc: string,
  secretKey: string,
): Promise<ClientSecretResult> {
  try {
    return { ok: true, clientSecret: await decryptSecret(clientSecretEnc, secretKey) }
  } catch {
    return { ok: false }
  }
}
