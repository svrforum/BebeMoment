import { describe, expect, it } from 'vitest'
import { formatBytes } from './format-bytes'

describe('formatBytes', () => {
  it('사람이 읽는 단위로 변환한다 — 바이트는 정수, 그 위는 소수 한 자리', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1023)).toBe('1023 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB')
    expect(formatBytes(1.25 * 1024 ** 4)).toBe('1.3 TB')
  })

  it('PB 위로는 단위를 더 올리지 않는다', () => {
    expect(formatBytes(2048 * 1024 ** 5)).toBe('2048.0 PB')
  })

  it('DB 의 BigInt 크기도 받는다', () => {
    expect(formatBytes(BigInt(3 * 1024 * 1024))).toBe('3.0 MB')
  })

  it('잘못된 값은 -', () => {
    expect(formatBytes(Number.NaN)).toBe('-')
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('-')
    expect(formatBytes(-5)).toBe('-')
  })
})
