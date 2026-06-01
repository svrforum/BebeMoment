import { describe, expect, it } from 'vitest'
import { makeBackupId } from './manifest'

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
