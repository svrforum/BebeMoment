import { describe, expect, it } from 'vitest'
import { APP_SHARE_MIN_VERSION, appShareUrl, supportsAppShare } from './app-share'

const ua = (v: string) =>
  `Mozilla/5.0 (Linux; Android 14) Chrome/131 Mobile Safari/537.36 bebeApp/${v}`

describe('supportsAppShare', () => {
  it('브라우저는 대상이 아니다 — navigator.share 가 이미 있다', () => {
    expect(supportsAppShare('Mozilla/5.0 (iPhone) Safari/605')).toBe(false)
  })

  // 구버전 앱은 bebe://share 를 모른다 — 보내면 알 수 없는 스킴으로 새어나가
  // 아무 일도 안 일어나거나 오류 화면이 뜬다. 그래서 버전으로 막는다.
  it(`${APP_SHARE_MIN_VERSION} 미만 앱에는 보내지 않는다`, () => {
    expect(supportsAppShare(ua('1.0.46'))).toBe(false)
    expect(supportsAppShare(ua('0.9.9'))).toBe(false)
  })

  it('지원 버전 이상이면 쓴다', () => {
    expect(supportsAppShare(ua(APP_SHARE_MIN_VERSION))).toBe(true)
    expect(supportsAppShare(ua('1.1.0'))).toBe(true)
    expect(supportsAppShare(ua('2.0.0'))).toBe(true)
  })

  it('버전이 이상하면 보내지 않는다', () => {
    expect(supportsAppShare('… bebeApp/')).toBe(false)
    expect(supportsAppShare('… bebeApp/abc')).toBe(false)
  })
})

describe('appShareUrl', () => {
  it('링크와 제목을 인코딩해 담는다', () => {
    const out = appShareUrl('http://x.test/s/abc', '복덩이 & 튼튼')
    expect(out.startsWith('bebe://share?')).toBe(true)
    expect(out).toContain(`url=${encodeURIComponent('http://x.test/s/abc')}`)
    expect(out).toContain(`title=${encodeURIComponent('복덩이 & 튼튼')}`)
  })

  it('제목이 없어도 링크만으로 만든다', () => {
    expect(appShareUrl('http://x.test/s/abc', '')).toBe(
      `bebe://share?url=${encodeURIComponent('http://x.test/s/abc')}`,
    )
  })
})
