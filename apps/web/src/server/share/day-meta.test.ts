import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatDayShareMeta } from './day-meta'

const t = (key: string, values?: Record<string, string | number>): string =>
  key === 'photoset.metaCount'
    ? `사진 ${values?.n}장`
    : key === 'photoset.storyCount'
      ? `이야기 ${values?.n}개`
      : key

describe('formatDayShareMeta', () => {
  it('joins month-day, photo count and story count', () => {
    expect(
      formatDayShareMeta({ date: '2026-09-04', locale: 'ko', photoCount: 12, storyCount: 2 }, t),
    ).toBe('9월 4일 · 사진 12장 · 이야기 2개')
  })

  it('omits the story segment when the day has no story', () => {
    expect(
      formatDayShareMeta({ date: '2026-09-04', locale: 'en', photoCount: 3, storyCount: 0 }, t),
    ).toBe('September 4 · 사진 3장')
  })

  it('formats the calendar day in UTC regardless of host timezone', () => {
    expect(
      formatDayShareMeta({ date: '2026-01-01', locale: 'en', photoCount: 1, storyCount: 0 }, t),
    ).toMatch(/^January 1 /)
  })

  // 공개 메타에 D+N 이 다시 들어오면 날짜와 함께 생일이 새어 나간다 — 페이지가 아기를 조회하지
  // 않는지까지 못 박는다.
  it('the public share page does not look up the baby or format D-day', () => {
    const page = readFileSync(path.join(process.cwd(), 'app/s/[token]/page.tsx'), 'utf8')
    expect(page).not.toMatch(/formatDDay|babyDaysDiff|prismaPublic\.baby/)
  })
})
