import { getServerTranslator } from '@/i18n/translator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type DayAssetLike, babyAgeNow, groupAssetsByDay } from './group-by-day'

// 운영 컨테이너는 TZ=Asia/Seoul 이다. 로컬과 UTC 가 갈리는 시간대에서 돌려야 날짜가 밀리는 게 보인다.
let savedTz: string | undefined
beforeEach(() => {
  savedTz = process.env.TZ
  process.env.TZ = 'Asia/Seoul'
})
afterEach(() => {
  if (savedTz === undefined) delete process.env.TZ
  else process.env.TZ = savedTz
})

const birth = new Date('2026-08-27')

function photo(id: string, takenAt: string): DayAssetLike {
  return { id, publicNo: 1, ts: new Date(takenAt), status: 'ready', kind: 'image', urls: null }
}

describe('groupAssetsByDay', () => {
  it('날짜마다 D+N 과 생후 N일이 함께 하루씩 간다 — 저녁에 찍은 사진도 찍은 날로', () => {
    // 촬영 시각은 벽시계를 UTC 필드에 담는다 — 10/12 20:20, 10/11 23:10, 10/10 11:15 에 찍은 사진.
    const groups = groupAssetsByDay(
      [
        photo('a', '2026-10-12T20:20:00Z'),
        photo('b', '2026-10-11T23:10:00Z'),
        photo('c', '2026-10-10T11:15:00Z'),
      ],
      birth,
      getServerTranslator('ko', 'age'),
    )

    expect(groups.map((g) => [g.dateLabel, g.babyDays, g.bucketLabel])).toEqual([
      ['2026.10.12', 46, '생후 47일'],
      ['2026.10.11', 45, '생후 46일'],
      ['2026.10.10', 44, '생후 45일'],
    ])
  })
})

describe('babyAgeNow', () => {
  it('새벽에도 오늘 날짜로 센다 — 실제 시각은 UTC 로 아직 어제다', () => {
    // 2026-10-16 08:30 KST
    expect(babyAgeNow(birth, new Date('2026-10-15T23:30:00Z'))).toEqual({
      days: 50,
      bucket: { kind: 'days', n: 51 },
    })
  })

  it('밤에도 오늘 날짜로 센다', () => {
    // 2026-10-16 23:59 KST
    expect(babyAgeNow(birth, new Date('2026-10-16T14:59:00Z'))).toEqual({
      days: 50,
      bucket: { kind: 'days', n: 51 },
    })
  })
})
