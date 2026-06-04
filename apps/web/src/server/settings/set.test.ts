import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { setSetting } from './set'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.settingHistory.deleteMany()
  await db.prismaPublic.appSetting.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

describe('setSetting', () => {
  it('upserts and records history with null user', async () => {
    await setSetting('app.name', 'bebe', null, db.prismaPublic)
    const row = await db.prismaPublic.appSetting.findUnique({ where: { key: 'app.name' } })
    expect(row?.value).toBe('bebe')
    const history = await db.prismaPublic.settingHistory.findMany({ where: { key: 'app.name' } })
    expect(history).toHaveLength(1)
    expect(history[0]?.oldValue).toBeNull()
    expect(history[0]?.newValue).toBe('bebe')
  })
  it('permissions.family 는 부여 가능 권한만 허용(owner전용 주입 거부)', async () => {
    await expect(
      setSetting('permissions.family', ['member.suspend'], null, db.prismaPublic),
    ).rejects.toThrow('admin.familyPermInvalid')
    // grantable 한 값은 허용.
    await setSetting('permissions.family', ['asset.upload'], null, db.prismaPublic)
    const row = await db.prismaPublic.appSetting.findUnique({
      where: { key: 'permissions.family' },
    })
    expect(row?.value).toEqual(['asset.upload'])
  })

  it('records diff when value changes', async () => {
    await setSetting('x', 1, null, db.prismaPublic)
    await setSetting('x', 2, null, db.prismaPublic)
    const history = await db.prismaPublic.settingHistory.findMany({
      where: { key: 'x' },
      orderBy: { changedAt: 'asc' },
    })
    expect(history).toHaveLength(2)
    expect(history[1]?.oldValue).toBe(1)
    expect(history[1]?.newValue).toBe(2)
  })
})
