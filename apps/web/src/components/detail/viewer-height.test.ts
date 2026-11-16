import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 뷰어는 `fixed inset-0` 루트를 꽉 채워야 한다 — 100vh(`h-screen`)로 잡으면 안 된다.
 *
 * 아이폰 Safari 탭은 100vh 를 툴바가 숨었을 때의 높이로 계산한다. 툴바가 보이는 동안엔 사진
 * 영역이 화면보다 그만큼 길어져, 아래에서 띄운 스토리 본문이 하단 버튼 줄 뒤로 밀려 가려지고
 * 사진도 가운데보다 아래에 섰다. 루트가 이미 화면 크기이므로 자식은 `h-full` 로 따른다.
 */
const DIR = 'src/components/detail'

describe('사진 뷰어 높이', () => {
  it('viewer-* 컴포넌트는 100vh 를 쓰지 않는다', () => {
    const offenders = readdirSync(DIR)
      .filter((f) => f.startsWith('viewer-') && f.endsWith('.tsx'))
      .filter((f) => /\bh-screen\b|100vh/.test(readFileSync(join(DIR, f), 'utf8')))
    expect(offenders).toEqual([])
  })
})
