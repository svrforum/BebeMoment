import { describe, expect, it } from 'vitest'
import { deriveTakenAt } from './taken-at'

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
