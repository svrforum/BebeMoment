import { ageBucket, daysBetween, monthsBetween } from '@bebe/core'
import { describe, expect, it } from 'vitest'
import { formatAgeBucket } from './labels'
import { getServerTranslator } from './translator'

/** 이 리팩터 전 `@bebe/core` 의 `bucketLabel` 구현 그대로 — ko 출력이 안 바뀌었는지 본다. */
function legacyBucketLabel(birthDate: Date, at: Date): string {
  const elapsed = daysBetween(birthDate, at)
  if (elapsed < 0) return `D-${-elapsed}`
  const day = elapsed + 1
  if (day <= 99) return `생후 ${day}일`
  if (day === 100) return '100일'
  const months = monthsBetween(birthDate, at)
  const years = Math.floor(months / 12)
  if (years >= 1) {
    const anniversary = months % 12 === 0 && at.getDate() === birthDate.getDate()
    if (anniversary) return years === 1 ? '1주년 (돌)' : `${years}주년`
  }
  return years >= 1 ? `생후 ${months}개월 · 만 ${years}세` : `생후 ${months}개월`
}

describe('ko 나이 버킷 표기는 리팩터 전후로 같다', () => {
  it('출생 200일 전 ~ 출생 10년 후 매일 같은 문자열을 낸다', () => {
    const t = getServerTranslator('ko', 'age')
    const birth = new Date('2026-01-01')
    const mismatches: string[] = []
    for (let d = -200; d < 3660; d += 1) {
      const at = new Date(Date.UTC(2026, 0, 1 + d))
      const before = legacyBucketLabel(birth, at)
      const after = formatAgeBucket(ageBucket(birth, at), t)
      if (before !== after) mismatches.push(`${at.toISOString().slice(0, 10)}: ${before} != ${after}`)
    }
    expect(mismatches.slice(0, 5)).toEqual([])
  })

  it('윤일 생일도 같다', () => {
    const t = getServerTranslator('ko', 'age')
    const birth = new Date('2024-02-29')
    for (let d = 0; d < 1500; d += 1) {
      const at = new Date(Date.UTC(2024, 1, 29 + d))
      expect(formatAgeBucket(ageBucket(birth, at), t)).toBe(legacyBucketLabel(birth, at))
    }
  })
})
