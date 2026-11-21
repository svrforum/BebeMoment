import { createHmac, timingSafeEqual } from 'node:crypto'
import { FILE_SERVE_TTL_SEC, FILE_SERVE_WINDOW_SEC, requireMediaSecret } from './jwt'

// 이미지 파생물(썸네일·표시용·포스터) 주소의 서명. 파일마다 JWT 를 하나씩 만들던 것을
// 자산당 하나로 줄인다 — 주소가 427자 → ~120자가 되고, 한 자산의 여섯 주소가 같은 서명을
// 써서 압축도 된다. 토큰은 `<만료 초>.<mac>` 이고 그 자산의 이미지 파생물 전부를 연다
// (원본·영상은 아니다 — 이름 허용 목록은 domain/asset-key.ts).
//
// 만료는 파일 서빙 JWT 와 같은 규칙이다: 서명 시각을 15분 창으로 내려 같은 창에서는 같은
// 주소가 나오고(브라우저 HTTP 캐시), 창의 마지막 초에 서명해도 TTL 만큼은 산다.

const TOKEN = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/

// JWT 와 같은 비밀을 그대로 쓰지 않고 용도별 키를 뽑는다 — 한쪽 서명이 다른 쪽 검증을
// 통과할 길이 없다.
let derived: { secret: string; key: Buffer } | null = null
function signingKey(): Buffer {
  const secret = requireMediaSecret()
  if (derived?.secret !== secret) {
    derived = {
      secret,
      key: createHmac('sha256', secret).update('bebe-media:image-url:v1').digest(),
    }
  }
  return derived.key
}

function macFor(assetId: string, exp: number): string {
  return createHmac('sha256', signingKey()).update(`${assetId}\n${exp}`).digest('base64url')
}

export function signImageAccess(
  assetId: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): string {
  const iat = Math.floor(nowSec / FILE_SERVE_WINDOW_SEC) * FILE_SERVE_WINDOW_SEC
  const exp = iat + FILE_SERVE_TTL_SEC + FILE_SERVE_WINDOW_SEC
  return `${exp}.${macFor(assetId, exp)}`
}

/** 유효하면 만료 시각(유닉스 초), 아니면 null. */
export function verifyImageAccess(
  assetId: string,
  token: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): number | null {
  const m = TOKEN.exec(token)
  if (!m) return null
  const exp = Number(m[1])
  // 바이트가 아니라 글자를 견준다 — 정규식이 길이(43)를 못 박았고, 같은 바이트로 풀리는
  // 다른 철자를 받지 않는다.
  if (!timingSafeEqual(Buffer.from(m[2] as string), Buffer.from(macFor(assetId, exp)))) return null
  return exp > nowSec ? exp : null
}
