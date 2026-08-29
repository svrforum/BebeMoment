import { describe, expect, it } from 'vitest'
import { videoCreatedAt } from './video-created-at'

const TZ = 'Asia/Seoul'

/** taken_at 은 "찍힌 벽시계 시각을 UTC 인 척" 저장한다 — 검증도 UTC 컴포넌트로 읽는다. */
function wall(d: Date | undefined): string | undefined {
  return d?.toISOString().replace('.000Z', 'Z')
}

describe('videoCreatedAt', () => {
  it('UTC creation_time 을 인스턴스 시간대의 벽시계로 옮긴다', () => {
    // 한국에서 8/28 19:35 에 찍으면 컨테이너는 UTC 10:35 로 기록한다.
    expect(wall(videoCreatedAt({ creation_time: '2026-08-28T10:35:00.000000Z' }, TZ))).toBe(
      '2026-08-28T19:35:00Z',
    )
  })

  it('자정을 넘겨 날짜가 바뀌는 경우도 옳게 옮긴다', () => {
    // UTC 8/28 16:00 = KST 8/29 01:00 — 하루 밀리면 타임라인이 어긋난다.
    expect(wall(videoCreatedAt({ creation_time: '2026-08-28T16:00:00Z' }, TZ))).toBe(
      '2026-08-29T01:00:00Z',
    )
  })

  it('오프셋이 붙은 퀵타임 태그를 우선한다 — 촬영지 시간대가 인스턴스와 다를 수 있다', () => {
    const tags = {
      creation_time: '2026-08-28T10:35:00Z',
      'com.apple.quicktime.creationdate': '2026-08-28T19:35:00+0900',
    }
    expect(wall(videoCreatedAt(tags, TZ))).toBe('2026-08-28T19:35:00Z')
  })

  it('오프셋 태그의 시간대가 인스턴스와 달라도 그 지역 벽시계를 쓴다', () => {
    const tags = { 'com.apple.quicktime.creationdate': '2026-08-28T09:00:00-0700' }
    expect(wall(videoCreatedAt(tags, TZ))).toBe('2026-08-28T09:00:00Z')
  })

  it('기기가 기록한 utc_offset 태그가 있으면 인스턴스 시간대 대신 그걸 쓴다', () => {
    // 삼성 폰이 실제로 남기는 조합. 여행지에서 찍어도 촬영지 시각이 유지된다.
    const tags = {
      creation_time: '2026-08-28T10:35:47.000000Z',
      'com.samsung.android.utc_offset': '+0900',
    }
    expect(wall(videoCreatedAt(tags, 'UTC'))).toBe('2026-08-28T19:35:47Z')
  })

  it('일부 muxer 가 쓰는 1904/1970 자리표시자는 무시한다', () => {
    expect(videoCreatedAt({ creation_time: '1904-01-01T00:00:00Z' }, TZ)).toBeUndefined()
    expect(videoCreatedAt({ creation_time: '1970-01-01T00:00:00Z' }, TZ)).toBeUndefined()
  })

  it('태그가 없거나 해석 불가면 undefined — 기존 폴백으로 넘긴다', () => {
    expect(videoCreatedAt(undefined, TZ)).toBeUndefined()
    expect(videoCreatedAt({}, TZ)).toBeUndefined()
    expect(videoCreatedAt({ creation_time: 'N/A' }, TZ)).toBeUndefined()
    expect(videoCreatedAt({ creation_time: '' }, TZ)).toBeUndefined()
  })

  it('미래로 한참 벗어난 값은 믿지 않는다', () => {
    expect(videoCreatedAt({ creation_time: '2999-01-01T00:00:00Z' }, TZ)).toBeUndefined()
  })
})
