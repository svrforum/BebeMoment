import { describe, expect, it } from 'vitest'
import { clockParts } from './clock'

describe('clockParts', () => {
  it('자정은 오전 12시다', () => {
    expect(clockParts(0)).toEqual({ period: 'am', hour12: 12, minute2: '00' })
  })

  it('정오는 오후 12시다', () => {
    expect(clockParts(720)).toEqual({ period: 'pm', hour12: 12, minute2: '00' })
  })

  it('오전 시각', () => {
    expect(clockParts(600)).toEqual({ period: 'am', hour12: 10, minute2: '00' })
    expect(clockParts(545)).toEqual({ period: 'am', hour12: 9, minute2: '05' })
  })

  it('오후 시각', () => {
    expect(clockParts(810)).toEqual({ period: 'pm', hour12: 1, minute2: '30' })
    expect(clockParts(1439)).toEqual({ period: 'pm', hour12: 11, minute2: '59' })
  })

  it('분을 두 자리로 채운다', () => {
    expect(clockParts(61).minute2).toBe('01')
  })

  it('하루를 넘거나 음수인 값도 하루 안으로 접는다', () => {
    expect(clockParts(1440)).toEqual({ period: 'am', hour12: 12, minute2: '00' })
    expect(clockParts(-60)).toEqual({ period: 'pm', hour12: 11, minute2: '00' })
  })
})
