import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deriveTakenAt, wallClockAsUtc } from './taken-at'

describe('deriveTakenAt', () => {
  it('prefers exifDateTimeOriginal over everything else', () => {
    const exif = new Date('2026-01-01T12:00:00')
    const result = deriveTakenAt({
      exifDateTimeOriginal: exif,
      filename: 'IMG_20260202_000000.jpg',
      fileModifiedAt: new Date('2026-03-01'),
      uploadedAt: new Date('2026-04-01'),
    })
    expect(result).toEqual({ value: exif, source: 'exif' })
  })

  it('falls back to filename pattern (IMG_YYYYMMDD_HHMMSS)', () => {
    const result = deriveTakenAt({
      filename: 'IMG_20260120_153045.jpg',
      fileModifiedAt: new Date('2026-04-01'),
      uploadedAt: new Date('2026-05-01'),
    })
    expect(result.source).toBe('filename')
    expect(result.value.toISOString()).toMatch(/^2026-01-20T15:30:45/)
  })

  it('falls back to filename pattern (KakaoTalk_YYYYMMDD_HHMMSS)', () => {
    const result = deriveTakenAt({
      filename: 'KakaoTalk_20260401_091234_1.jpg',
      fileModifiedAt: new Date('2099-01-01'),
      uploadedAt: new Date('2099-01-01'),
    })
    expect(result.source).toBe('filename')
    expect(result.value.toISOString()).toMatch(/^2026-04-01T09:12:34/)
  })

  it('falls back to file mtime', () => {
    const mtime = new Date('2026-02-15T10:00:00')
    const result = deriveTakenAt({
      filename: 'screenshot.png',
      fileModifiedAt: mtime,
      uploadedAt: new Date('2099-01-01'),
    })
    expect(result).toEqual({ value: mtime, source: 'filemtime' })
  })

  it('last resort: uploadedAt', () => {
    const uploaded = new Date('2026-06-01T00:00:00')
    const result = deriveTakenAt({
      filename: 'unknown.bin',
      uploadedAt: uploaded,
    })
    expect(result).toEqual({ value: uploaded, source: 'uploaded' })
  })
})

describe('wallClockAsUtc', () => {
  it('실제 순간의 벽시계를 UTC 필드에 담는다 — 밀리초까지', () => {
    const instant = new Date(2026, 9, 12, 10, 0, 30, 250)
    expect(wallClockAsUtc(instant).toISOString()).toBe('2026-10-12T10:00:30.250Z')
  })

  describe.each([
    ['Asia/Seoul', '2026-10-12T07:44:00.123Z'],
    // Intl 은 이 표기를 시간대 이름으로 받지 않지만(RangeError) Node 의 로컬 시각은 +9시간이다.
    ['KST-9', '2026-10-12T07:44:00.123Z'],
    [':/etc/localtime', null],
    ['UTC', '2026-10-11T22:44:00.123Z'],
  ])('TZ=%s', (zone, expected) => {
    let saved: string | undefined
    beforeEach(() => {
      saved = process.env.TZ
      process.env.TZ = zone
    })
    afterEach(() => {
      if (saved === undefined) delete process.env.TZ
      else process.env.TZ = saved
    })

    it('Node 가 알아듣는 시간대면 어떤 표기든 던지지 않고 그 벽시계로 옮긴다', () => {
      // 2026-10-12 07:44:00.123 KST 에 수정된 파일.
      const moved = wallClockAsUtc(new Date('2026-10-11T22:44:00.123Z'))
      if (expected) expect(moved.toISOString()).toBe(expected)
      else expect(Number.isNaN(moved.getTime())).toBe(false)
    })
  })
})
