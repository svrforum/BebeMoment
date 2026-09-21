import { describe, expect, it } from 'vitest'
import { canSubmitGrowth } from './growth-submittable'

describe('canSubmitGrowth', () => {
  it('키·몸무게가 모두 비면 저장을 막는다', () => {
    expect(canSubmitGrowth({ height: '', weight: '' })).toBe(false)
  })

  it('공백만 입력한 것도 빈 값으로 본다', () => {
    expect(canSubmitGrowth({ height: '  ', weight: '\t' })).toBe(false)
  })

  it('키만 있어도 저장할 수 있다', () => {
    expect(canSubmitGrowth({ height: '62.5', weight: '' })).toBe(true)
  })

  it('몸무게만 있어도 저장할 수 있다', () => {
    expect(canSubmitGrowth({ height: '', weight: '6.2' })).toBe(true)
  })

  it('머리둘레만 있던 옛 기록은 키·몸무게가 비어도 수정할 수 있다', () => {
    expect(canSubmitGrowth({ height: '', weight: '', hasHiddenMeasurement: true })).toBe(true)
  })
})
