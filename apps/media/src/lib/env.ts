import { type Env, parseEnv } from '@bebe/config'

export function getEnv(): Env {
  return parseEnv(process.env as Record<string, string | undefined>)
}

const SERVER_SECRETS = ['MEDIA_SERVICE_TOKEN', 'MEDIA_JWT_SECRET'] as const

/**
 * 스키마는 web 과 같이 써서 두 시크릿이 optional 이다. 그래서 빠진 media 는 부팅도 health 도
 * 멀쩡하고 첫 업로드·주소 요청에서야 500 이 났다. HTTP 를 받는 역할이면 부팅에서 막는다.
 * 길이(32자+)는 스키마가 이미 본다.
 */
export function assertServerSecrets(env: Env): void {
  if (env.MEDIA_ROLE === 'worker') return
  const missing = SERVER_SECRETS.filter((key) => !env[key])
  if (missing.length > 0) {
    throw new Error(
      `${missing.join(', ')} must be set (32+ characters) when MEDIA_ROLE=${env.MEDIA_ROLE}`,
    )
  }
}

// 요청마다 서명·검증에서 불리는 값이라 매번 스키마 전체를 돌리지 않는다(호출당 수십 µs,
// 주소 묶음 하나에 수백 번). 원문이 바뀌면 다시 읽어 테스트의 env 교체도 그대로 따른다.
function memoized<T>(name: string, read: (env: Env) => T): () => T {
  let last: { raw: string | undefined; value: T } | undefined
  return () => {
    const raw = process.env[name]
    if (last === undefined || last.raw !== raw) last = { raw, value: read(getEnv()) }
    return last.value
  }
}

function required(key: (typeof SERVER_SECRETS)[number]): () => string {
  return memoized(key, (env) => {
    const value = env[key]
    if (!value) throw new Error(`${key} must be set (32+ characters)`)
    return value
  })
}

export const mediaServiceToken = required('MEDIA_SERVICE_TOKEN')
export const mediaJwtSecret = required('MEDIA_JWT_SECRET')

/** 비어 있으면 주소가 루트 상대(`/media/...`)가 된다 — 미디어를 다른 호스트에 둘 때만 설정. */
export const mediaPublicBase = memoized('MEDIA_PUBLIC_BASE_URL', (env) =>
  (env.MEDIA_PUBLIC_BASE_URL ?? '').replace(/\/$/, ''),
)
