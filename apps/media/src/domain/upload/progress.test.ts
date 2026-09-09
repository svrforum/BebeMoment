import { type TestDb, startTestDb } from '@bebe/db-media/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { touchUploadProgress } from './progress'

const FAMILY = '11111111-1111-1111-1111-111111111111'
const USER = '22222222-2222-2222-2222-222222222222'
const LONG_AGO = new Date('2020-01-01T00:00:00Z')

let db: TestDb
beforeAll(async () => {
  db = await startTestDb()
  await db.prisma.$executeRawUnsafe(`
    INSERT INTO public.users (id, email, password_hash, display_name, created_at, updated_at)
    VALUES ('${USER}', 'p@b.com', 'x', 'U', NOW(), NOW()) ON CONFLICT (id) DO NOTHING`)
  await db.prisma.$executeRawUnsafe(`
    INSERT INTO public.families (id, name, slug, created_by_user_id, created_at, updated_at)
    VALUES ('${FAMILY}', 'F', 'f', '${USER}', NOW(), NOW()) ON CONFLICT (id) DO NOTHING`)
}, 180_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prisma.asset.deleteMany({ where: { familyId: FAMILY } })
})

async function seed(id: string, status: 'uploading' | 'processing' | 'ready'): Promise<void> {
  await db.prisma.asset.create({
    data: {
      id,
      familyId: FAMILY,
      uploadedByUserId: USER,
      kind: 'video',
      originalKey: `k-${id}`,
      originalFilename: 'clip.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 1n,
      sha256: id.replace(/-/g, '').padEnd(64, '0'),
      takenAt: new Date(),
      takenAtSource: 'uploaded',
      status,
    },
  })
  await db.prisma.$executeRawUnsafe(
    'UPDATE media.assets SET updated_at = $1 WHERE id = $2::uuid',
    LONG_AGO,
    id,
  )
}

async function updatedAt(id: string): Promise<Date> {
  const row = await db.prisma.asset.findUniqueOrThrow({
    where: { id },
    select: { updatedAt: true },
  })
  return row.updatedAt
}

describe('touchUploadProgress', () => {
  it('청크가 도착하면 uploading 자산의 updated_at 을 민다', async () => {
    const id = '33333333-3333-3333-3333-333333333333'
    await seed(id, 'uploading')
    expect(await touchUploadProgress(id, db.prisma)).toBe(true)
    expect((await updatedAt(id)).getTime()).toBeGreaterThan(LONG_AGO.getTime())
  })

  it('이미 처리·완료된 자산은 건드리지 않는다', async () => {
    const processing = '44444444-4444-4444-4444-444444444444'
    const ready = '55555555-5555-5555-5555-555555555555'
    await seed(processing, 'processing')
    await seed(ready, 'ready')
    expect(await touchUploadProgress(processing, db.prisma)).toBe(false)
    expect(await touchUploadProgress(ready, db.prisma)).toBe(false)
    expect((await updatedAt(processing)).getTime()).toBe(LONG_AGO.getTime())
    expect((await updatedAt(ready)).getTime()).toBe(LONG_AGO.getTime())
  })

  it('모르는 id 는 조용한 no-op', async () => {
    expect(await touchUploadProgress('66666666-6666-6666-6666-666666666666', db.prisma)).toBe(false)
  })

  it('uuid 가 아닌 id 로도 던지지 않는다', async () => {
    expect(await touchUploadProgress('not-a-uuid', db.prisma)).toBe(false)
  })
})
