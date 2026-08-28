import { describe, expect, it } from 'vitest'
import { isNewerVersion, parseAppVersion, pickAndroidRelease } from './app-release'

describe('parseAppVersion', () => {
  it('네이티브 앱 UA 에서 버전을 읽는다', () => {
    expect(
      parseAppVersion(
        'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36 bebeApp/1.0.44',
      ),
    ).toBe('1.0.44')
  })

  it('앱 마커가 없는 브라우저 UA 는 null', () => {
    expect(parseAppVersion('Mozilla/5.0 (iPhone) Safari/604.1')).toBeNull()
  })

  it('멀티 인스턴스 접미사가 붙어도 읽는다', () => {
    expect(parseAppVersion('… bebeApp/1.0.44 bebeAppMulti')).toBe('1.0.44')
  })
})

describe('isNewerVersion', () => {
  it('패치 증가를 잡는다', () => {
    expect(isNewerVersion('1.0.45', '1.0.44')).toBe(true)
  })

  it('같으면 false', () => {
    expect(isNewerVersion('1.0.44', '1.0.44')).toBe(false)
  })

  it('낮으면 false', () => {
    expect(isNewerVersion('1.0.43', '1.0.44')).toBe(false)
  })

  it('숫자로 비교한다 — 문자열 비교면 1.0.9 가 1.0.10 보다 크다고 나온다', () => {
    expect(isNewerVersion('1.0.10', '1.0.9')).toBe(true)
    expect(isNewerVersion('1.0.9', '1.0.10')).toBe(false)
  })

  it('마이너·메이저 자리도 본다', () => {
    expect(isNewerVersion('1.1.0', '1.0.99')).toBe(true)
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true)
  })
})

describe('pickAndroidRelease', () => {
  const rel = (
    tag: string,
    extra: Partial<Parameters<typeof pickAndroidRelease>[0][number]> = {},
  ) => ({
    tag_name: tag,
    html_url: `https://x/${tag}`,
    prerelease: false,
    draft: false,
    assets: [
      {
        name: `bebe-${tag.replace('android-v', '')}.apk`,
        browser_download_url: `https://x/${tag}.apk`,
      },
    ],
    ...extra,
  })

  it('웹 릴리스(v*)를 건너뛰고 최신 android-v 를 고른다', () => {
    const out = pickAndroidRelease([
      rel('v0.0.77'),
      rel('android-v1.0.44'),
      rel('v0.0.76'),
      rel('android-v1.0.43'),
    ])
    expect(out).toEqual({ version: '1.0.44', url: 'https://x/android-v1.0.44.apk' })
  })

  it('초안·프리릴리스는 무시한다', () => {
    const out = pickAndroidRelease([
      rel('android-v1.0.45', { draft: true }),
      rel('android-v1.0.44', { prerelease: true }),
      rel('android-v1.0.43'),
    ])
    expect(out?.version).toBe('1.0.43')
  })

  it('apk 자산이 없으면 릴리스 페이지로 폴백한다', () => {
    const out = pickAndroidRelease([rel('android-v1.0.44', { assets: [] })])
    expect(out).toEqual({ version: '1.0.44', url: 'https://x/android-v1.0.44' })
  })

  it('android 릴리스가 하나도 없으면 null', () => {
    expect(pickAndroidRelease([rel('v0.0.77')])).toBeNull()
  })
})
