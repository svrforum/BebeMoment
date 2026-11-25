const PROBE_ORIGIN = 'http://same-origin.invalid'

// 로그인 뒤 돌아갈 경로는 같은 출처의 절대경로만 받는다. 앞 글자만 보는 정규식으로는 모자란다 —
// URL 파서는 탭·줄바꿈을 지우고 \ 를 / 로 읽어서 '/\t/evil.example' 이 //evil.example 이 된다.
// 리다이렉트가 쓸 것과 같은 파서로 풀어 출처가 그대로인지 본다.
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || !/^\/(?![/\\])/.test(raw)) return null
  try {
    return new URL(raw, PROBE_ORIGIN).origin === PROBE_ORIGIN ? raw : null
  } catch {
    return null
  }
}
