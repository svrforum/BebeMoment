import { describe, expect, it } from 'vitest'
import { isValidBackupId, makeBackupId } from './manifest'

describe('makeBackupId', () => {
  it('같은 초에 만들어도 충돌하지 않는다(랜덤 suffix)', () => {
    const now = new Date('2026-06-01T12:00:00.000Z')
    expect(makeBackupId('full', now)).not.toBe(makeBackupId('full', now))
  })

  it('형식: bebe-backup-YYYYMMDD-HHMMSS-<type>-<hex6>', () => {
    const id = makeBackupId('incr', new Date('2026-06-01T12:34:56.000Z'))
    expect(id).toMatch(/^bebe-backup-20260601-123456-incr-[0-9a-f]{6}$/)
  })
})

describe('isValidBackupId', () => {
  it('makeBackupId 가 만든 (suffix 포함) id 를 받아들인다', () => {
    expect(isValidBackupId(makeBackupId('full', new Date('2026-06-01T12:00:00Z')))).toBe(true)
    expect(isValidBackupId('bebe-backup-20260601-120000-incr-ab12cd')).toBe(true)
  })
  it('옛 suffix 없는 id 도 호환 허용', () => {
    expect(isValidBackupId('bebe-backup-20260601-120000-full')).toBe(true)
  })
  it('형식에 안 맞으면 거부(경로 주입 가드)', () => {
    expect(isValidBackupId('../../etc/passwd')).toBe(false)
    expect(isValidBackupId('bebe-backup-20260601-120000-bogus')).toBe(false)
    expect(isValidBackupId('bebe-backup-20260601-120000-full-XYZ')).toBe(false)
  })
})
