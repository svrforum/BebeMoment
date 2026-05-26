import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { setSetting } from '@/server/settings/set'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getFamilyCapabilities } from './family-capabilities'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.appSetting.deleteMany()
})

describe('getFamilyCapabilities', () => {
  it('returns defaults when unset (no upload)', async () => {
    const caps = await getFamilyCapabilities(db.prismaPublic)
    expect(caps.has('social.comment.create')).toBe(true)
    expect(caps.has('asset.upload')).toBe(false)
  })
  it('reflects configured grants', async () => {
    await setSetting('permissions.family', ['asset.upload'], null, db.prismaPublic)
    const caps = await getFamilyCapabilities(db.prismaPublic)
    expect(caps.has('asset.upload')).toBe(true)
  })
})
