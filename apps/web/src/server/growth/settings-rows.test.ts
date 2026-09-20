import { describe, expect, it } from 'vitest'
import { growthSettingsRows } from './settings-rows'

const labels = {
  label: () => '성장',
  labelForBaby: (name: string) => `성장 · ${name}`,
}

describe('growthSettingsRows', () => {
  it('아기가 없으면 행을 만들지 않는다', () => {
    expect(growthSettingsRows([], labels)).toEqual([])
  })

  it('아기가 하나면 이름 없는 행 하나를 그 아기의 성장 페이지로 보낸다', () => {
    expect(growthSettingsRows([{ id: 'b1', name: '딸기' }], labels)).toEqual([
      { href: '/babies/b1/growth', label: '성장' },
    ])
  })

  it('아기가 둘 이상이면 주어진 순서대로 아기마다 한 행씩 만든다', () => {
    expect(
      growthSettingsRows(
        [
          { id: 'b1', name: '딸기' },
          { id: 'b2', name: '포도' },
          { id: 'b3', name: '수박' },
        ],
        labels,
      ),
    ).toEqual([
      { href: '/babies/b1/growth', label: '성장 · 딸기' },
      { href: '/babies/b2/growth', label: '성장 · 포도' },
      { href: '/babies/b3/growth', label: '성장 · 수박' },
    ])
  })

  it('href 는 언제나 그 아기의 성장 페이지를 가리킨다', () => {
    const rows = growthSettingsRows(
      [
        { id: 'aaa', name: 'a' },
        { id: 'bbb', name: 'b' },
      ],
      labels,
    )
    expect(rows.map((r) => r.href)).toEqual(['/babies/aaa/growth', '/babies/bbb/growth'])
  })
})
