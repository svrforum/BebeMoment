import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { getSetting } from './get'

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

const BoolSchema = z.boolean()
const NumSchema = z.number()

describe('getSetting', () => {
  it('returns default when not set', async () => {
    const v = await getSetting('upload.convert_to_compatible', BoolSchema, false, db.prismaPublic)
    expect(v).toBe(false)
  })
  it('returns stored value when set', async () => {
    await db.prismaPublic.appSetting.create({
      data: { key: 'upload.convert_to_compatible', value: true },
    })
    const v = await getSetting('upload.convert_to_compatible', BoolSchema, false, db.prismaPublic)
    expect(v).toBe(true)
  })
  it('returns default when stored value fails validation', async () => {
    await db.prismaPublic.appSetting.create({
      data: { key: 'upload.max_video_bytes', value: 'not-a-number' },
    })
    const v = await getSetting('upload.max_video_bytes', NumSchema, 2_147_483_648, db.prismaPublic)
    expect(v).toBe(2_147_483_648)
  })
})
