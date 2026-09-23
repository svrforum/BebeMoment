import { describe, expect, it } from 'vitest'
import { mergeTemplateItems, normalizeTemplateItems } from './checklist-template-merge'

describe('mergeTemplateItems', () => {
  it('이미 있는 항목은 건너뛰고 없는 것만 뒤에 붙인다', () => {
    expect(mergeTemplateItems(['분유', '기저귀'], ['기저귀', '물티슈', '손수건'])).toEqual([
      '물티슈',
      '손수건',
    ])
  })

  it('앞뒤 공백과 대소문자 차이는 같은 항목으로 본다', () => {
    expect(mergeTemplateItems([' Diaper '], ['diaper', '분유'])).toEqual(['분유'])
  })

  it('템플릿 안의 중복도 한 번만 붙인다', () => {
    expect(mergeTemplateItems([], ['분유', '분유 '])).toEqual(['분유'])
  })
})

describe('normalizeTemplateItems', () => {
  it('빈 줄을 버리고 공백을 다듬고 중복을 없앤다', () => {
    expect(normalizeTemplateItems(['  분유 ', '', '분유', '기저귀'])).toEqual(['분유', '기저귀'])
  })
})
