import os from 'node:os'
import { describe, expect, it } from 'vitest'
import { formatBytes, getSystemInfo } from './info'

describe('formatBytes', () => {
  it('사람이 읽는 단위로 변환한다', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB')
  })
  it('잘못된 값은 -', () => {
    expect(formatBytes(Number.NaN)).toBe('-')
    expect(formatBytes(-5)).toBe('-')
  })
})

describe('getSystemInfo', () => {
  it('CPU·메모리·디스크 정보를 채운다', async () => {
    const info = await getSystemInfo([{ label: '임시', path: os.tmpdir() }])
    expect(info.cpuCount).toBeGreaterThan(0)
    expect(info.mem.total).toBeGreaterThan(0)
    expect(info.mem.used).toBeLessThanOrEqual(info.mem.total)
    expect(info.nodeVersion).toMatch(/^v\d/)
    const disk = info.disks[0]
    expect(disk).toBeDefined()
    if (disk && 'total' in disk) {
      expect(disk.total).toBeGreaterThan(0)
      expect(disk.free).toBeLessThanOrEqual(disk.total)
    } else {
      throw new Error('expected disk total')
    }
  })

  it('없는 경로는 error 로 표시(throw 안 함)', async () => {
    const info = await getSystemInfo([{ label: '없음', path: '/nonexistent-xyz-12345' }])
    const disk = info.disks[0]
    expect(disk && 'error' in disk).toBe(true)
  })
})
