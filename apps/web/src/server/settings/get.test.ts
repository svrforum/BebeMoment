import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { getSetting } from './get'

let db: TestDb
beforeAll(async () => {
  db = await startTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prisma.appSetting.deleteMany()
})

const BoolSchema = z.boolean()
const NumSchema = z.number()

describe('getSetting', () => {
  it('returns default when not set', async () => {
    const v = await getSetting('upload.convert_to_compatible', BoolSchema, false, db.prisma)
    expect(v).toBe(false)
  })
  it('returns stored value when set', async () => {
    await db.prisma.appSetting.create({
      data: { key: 'upload.convert_to_compatible', value: true },
    })
    const v = await getSetting('upload.convert_to_compatible', BoolSchema, false, db.prisma)
    expect(v).toBe(true)
  })
  it('returns default when stored value fails validation', async () => {
    await db.prisma.appSetting.create({
      data: { key: 'upload.max_video_bytes', value: 'not-a-number' },
    })
    const v = await getSetting('upload.max_video_bytes', NumSchema, 2_147_483_648, db.prisma)
    expect(v).toBe(2_147_483_648)
  })
})
