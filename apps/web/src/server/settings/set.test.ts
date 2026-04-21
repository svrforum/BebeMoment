import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { setSetting } from './set'

let db: TestDb
beforeAll(async () => {
  db = await startTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prisma.settingHistory.deleteMany()
  await db.prisma.appSetting.deleteMany()
  await db.prisma.user.deleteMany()
})

describe('setSetting', () => {
  it('upserts and records history with null user', async () => {
    await setSetting('app.name', 'bebe', null, db.prisma)
    const row = await db.prisma.appSetting.findUnique({ where: { key: 'app.name' } })
    expect(row?.value).toBe('bebe')
    const history = await db.prisma.settingHistory.findMany({ where: { key: 'app.name' } })
    expect(history).toHaveLength(1)
    expect(history[0]?.oldValue).toBeNull()
    expect(history[0]?.newValue).toBe('bebe')
  })
  it('records diff when value changes', async () => {
    await setSetting('x', 1, null, db.prisma)
    await setSetting('x', 2, null, db.prisma)
    const history = await db.prisma.settingHistory.findMany({
      where: { key: 'x' },
      orderBy: { changedAt: 'asc' },
    })
    expect(history).toHaveLength(2)
    expect(history[1]?.oldValue).toBe(1)
    expect(history[1]?.newValue).toBe(2)
  })
})
