import { describe, expect, it } from 'vitest'
import { toLogFields, uploadReportSchema } from './upload-report'

const who = {
  userId: '33333333-3333-3333-3333-333333333333',
  familyId: '11111111-1111-1111-1111-111111111111',
}

describe('uploadReportSchema', () => {
  it('알 수 없는 흐름·단계는 거절한다 — 로그가 임의 문자열로 오염되지 않게', () => {
    expect(uploadReportSchema.safeParse({ flow: 'nope', step: 'init', message: 'x' }).success).toBe(
      false,
    )
    expect(
      uploadReportSchema.safeParse({ flow: 'upload-sheet', step: 'nope', message: 'x' }).success,
    ).toBe(false)
  })

  it('긴 메시지는 받지 않는다', () => {
    const r = uploadReportSchema.safeParse({
      flow: 'upload-sheet',
      step: 'init',
      message: 'x'.repeat(501),
    })
    expect(r.success).toBe(false)
  })

  it('assetIds 는 uuid 만, 50개까지', () => {
    expect(
      uploadReportSchema.safeParse({
        flow: 'upload-sheet',
        step: 'rollback',
        message: 'x',
        assetIds: ['not-a-uuid'],
      }).success,
    ).toBe(false)
  })
})

describe('toLogFields', () => {
  it('숫자들을 펼쳐 한 줄로 검색 가능하게 만든다', () => {
    const out = toLogFields(
      {
        flow: 'timeline-composer',
        step: 'collect-asset-ids',
        message: 'nope',
        counts: { staged: 12, collected: 0 },
      },
      who,
    )
    expect(out).toMatchObject({ flow: 'timeline-composer', staged: 12, collected: 0 })
    expect(out.userId).toBe(who.userId)
  })

  it('여러 줄 스택은 한 줄로 접고 길면 자른다 — 로그 한 줄이 수 KB 가 되지 않게', () => {
    const out = toLogFields(
      { flow: 'upload-sheet', step: 'story-post', message: `a\n  b\n\tc${'x'.repeat(600)}` },
      who,
    )
    expect(String(out.message)).not.toContain('\n')
    expect(String(out.message).length).toBeLessThanOrEqual(300)
  })

  it('빈 assetIds 는 넣지 않는다', () => {
    const out = toLogFields(
      { flow: 'story-edit', step: 'rollback', message: 'x', assetIds: [] },
      who,
    )
    expect(out).not.toHaveProperty('assetIds')
  })
})
