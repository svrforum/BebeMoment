import { FILENAME_RE } from '@bebe/media-client'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

// web 과 media 가 같은 규칙을 써야 한다. 예전엔 web 이 통과시킨 이름을 media 가 거절해
// 사용자에겐 번역 안 된 '[VALIDATION_ERROR]' 토스트가 그대로 떴다. 복제하지 않고
// media 의 정규식을 그대로 가져다 쓰는지 여기서 못 박는다.
const webFilename = z.string().min(1).max(255).regex(FILENAME_RE, 'asset.filenameInvalid')

describe('파일명 규칙은 media 와 같다', () => {
  it('평범한 이름은 통과', () => {
    for (const n of ['a.jpg', '가족사진 2026.png', 'C0012.MTS', 'x'.repeat(255)]) {
      expect(webFilename.safeParse(n).success, n).toBe(true)
    }
  })

  it('경로 구분자는 거절 — media 가 거절하는 것을 web 도 거절해야 한다', () => {
    expect(webFilename.safeParse('a/b.jpg').success).toBe(false)
    expect(webFilename.safeParse('a\\b.jpg').success).toBe(false)
  })

  it('제어문자는 거절', () => {
    expect(webFilename.safeParse(`a${String.fromCharCode(9)}b.jpg`).success).toBe(false)
    expect(webFilename.safeParse(`a${String.fromCharCode(10)}b.jpg`).success).toBe(false)
    expect(webFilename.safeParse(`a${String.fromCharCode(0)}b.jpg`).success).toBe(false)
  })

  it('빈 이름·255자 초과는 거절', () => {
    expect(webFilename.safeParse('').success).toBe(false)
    expect(webFilename.safeParse('x'.repeat(256)).success).toBe(false)
  })

  it('거절 사유는 카탈로그 키다 — 날것의 영어가 사용자에게 가지 않게', () => {
    const r = webFilename.safeParse('a/b.jpg')
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]?.message).toBe('asset.filenameInvalid')
  })
})
