import { describe, expect, it } from 'vitest'
import { decideStoryPush } from './story-readiness'

describe('decideStoryPush', () => {
  it('사진이 없으면 바로 보낸다', () => {
    expect(decideStoryPush({ total: 0, settled: 0, attempts: 0, maxAttempts: 30 })).toBe('send')
  })

  it('모든 사진이 settle 되면 보낸다', () => {
    expect(decideStoryPush({ total: 3, settled: 3, attempts: 0, maxAttempts: 30 })).toBe('send')
  })

  it('아직 처리 중인 사진이 있으면 미룬다', () => {
    expect(decideStoryPush({ total: 3, settled: 1, attempts: 0, maxAttempts: 30 })).toBe('defer')
  })

  it('cap 을 넘기면 미처리여도 보낸다(유실 방지)', () => {
    expect(decideStoryPush({ total: 3, settled: 1, attempts: 30, maxAttempts: 30 })).toBe('send')
  })

  it('failed 로 settle 된 것도 settled 로 계산되어(>=total) 보낸다', () => {
    // 모든 사진이 ready 또는 failed → settled===total → send
    expect(decideStoryPush({ total: 2, settled: 2, attempts: 5, maxAttempts: 30 })).toBe('send')
  })
})
