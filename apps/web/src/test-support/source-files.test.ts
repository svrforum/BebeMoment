import { describe, expect, it } from 'vitest'
import { stripComments } from './source-files'

describe('stripComments', () => {
  it('줄·블록·JSDoc 주석을 지우고 줄 수는 그대로 둔다', () => {
    const src = [
      '/**',
      ' * doc()',
      ' */',
      'a() // tail()',
      '/*',
      '  bare()',
      '*/',
      'b(/* inline() */ 1)',
    ].join('\n')
    expect(stripComments(src)).toBe(['', '', '', 'a() ', '', '', '', 'b( 1)'].join('\n'))
  })

  it('문자열·템플릿·정규식 안의 주석 모양은 코드다', () => {
    const src = [
      "const m = 'image/*'",
      "const u = 'https://example.com' // gone",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: 소스 텍스트 픽스처
      'const t = `a // ${x /* gone */} /* b */`',
      'const r = /\\/\\/.*/',
    ].join('\n')
    expect(stripComments(src)).toBe(
      [
        "const m = 'image/*'",
        "const u = 'https://example.com' ",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: 소스 텍스트 픽스처
        'const t = `a // ${x } /* b */`',
        'const r = /\\/\\/.*/',
      ].join('\n'),
    )
  })

  it('JSX 본문의 // 는 글자이고 {/* */} 는 주석이다', () => {
    const src = 'const e = <p>// hi {/* gone */}</p>'
    expect(stripComments(src, 'x.tsx')).toBe('const e = <p>// hi {}</p>')
  })
})
