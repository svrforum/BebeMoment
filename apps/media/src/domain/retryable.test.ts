import { describe, expect, it } from 'vitest'
import { retryFailureReason } from './retryable'

describe('retryFailureReason', () => {
  // 원본 바이트가 없으면 재처리는 몇 번을 눌러도 같은 ENOENT 로 끝난다. 그런데 화면에는
  // 그냥 '실패'로 보여서 사용자가 계속 누르게 된다 — 192MB 영상 업로드가 중간에 끊긴 뒤
  // 실제로 그렇게 됐다. 다시 올려야 한다고 말해줘야 한다.
  it('원본이 없으면 재시도 불가로 본다', () => {
    expect(retryFailureReason({ originalExists: false })).toBe('original-missing')
  })

  it('원본이 있으면 재시도할 수 있다', () => {
    expect(retryFailureReason({ originalExists: true })).toBeNull()
  })
})
