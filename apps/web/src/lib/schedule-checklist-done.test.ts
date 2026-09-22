import { describe, expect, it } from 'vitest'
import { checklistDoneCredit, nextChecklistDone } from './schedule-checklist-done'

const NOW = new Date('2026-09-22T01:00:00.000Z')
const EARLIER = new Date('2026-09-21T01:00:00.000Z')

describe('nextChecklistDone', () => {
  it('체크하면 지금 시각과 누른 사람을 함께 붙인다', () => {
    expect(nextChecklistDone({ doneAt: null }, NOW, '아빠')).toEqual({
      doneAt: NOW,
      doneByName: '아빠',
    })
  })

  /** 이름을 모르는 채 체크해도 완료는 완료다 — 이름 칸만 비운다. */
  it('보는 사람 이름을 모르면 이름 없이 완료한다', () => {
    expect(nextChecklistDone({ doneAt: null }, NOW, null)).toEqual({
      doneAt: NOW,
      doneByName: null,
    })
  })

  /** 체크를 풀면 이름도 같이 지운다 — 남겨 두면 안 한 항목에 남의 이름이 붙는다. */
  it('체크를 풀면 이름도 지운다', () => {
    expect(nextChecklistDone({ doneAt: EARLIER }, NOW, '엄마')).toEqual({
      doneAt: null,
      doneByName: null,
    })
  })
})

describe('checklistDoneCredit', () => {
  it('완료한 항목만 이름을 보여준다', () => {
    expect(checklistDoneCredit({ doneAt: EARLIER, doneByName: '엄마' })).toBe('엄마')
  })

  it('완료가 아니면 이름이 남아 있어도 보여주지 않는다', () => {
    expect(checklistDoneCredit({ doneAt: null, doneByName: '엄마' })).toBe(null)
  })

  it('이름이 비어 있으면 빈 자리를 만들지 않는다', () => {
    expect(checklistDoneCredit({ doneAt: EARLIER, doneByName: null })).toBe(null)
    expect(checklistDoneCredit({ doneAt: EARLIER, doneByName: '   ' })).toBe(null)
  })
})
