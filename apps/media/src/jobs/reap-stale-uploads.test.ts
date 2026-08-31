import { type TestDb, startTestDb } from '@bebe/db-media/src/test-db'
import type pino from 'pino'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { reapStaleUploads, reapStuckProcessing } from './reap-stale-uploads'

const FAMILY = '11111111-1111-1111-1111-111111111111'
const USER = '22222222-2222-2222-2222-222222222222'
const silent = { warn: () => {}, info: () => {}, error: () => {} } as unknown as pino.Logger

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

async function makeUploading(id: string): Promise<void> {
  await db.prisma.asset.create({
    data: {
      id,
      familyId: FAMILY,
      uploadedByUserId: USER,
      kind: 'image',
      originalKey: `k-${id}`,
      originalFilename: 'x.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1n,
      sha256: id.replace(/-/g, '').padEnd(64, '0'),
      takenAt: new Date(),
      takenAtSource: 'uploaded',
      status: 'uploading',
    },
  })
}

async function seedWith(id: string, status: 'uploading' | 'processing', updatedAt: Date) {
  await makeUploading(id)
  await db.prisma.$executeRawUnsafe(
    `UPDATE media.assets SET status = $1::media.asset_status, updated_at = $2 WHERE id = $3::uuid`,
    status,
    updatedAt,
    id,
  )
}

describe('reapStaleUploads', () => {
  it('오래된 uploading 은 failed 로, 최근 uploading·다른 상태는 그대로 둔다', async () => {
    const stale = '33333333-3333-3333-3333-333333333333'
    const fresh = '44444444-4444-4444-4444-444444444444'
    const ready = '55555555-5555-5555-5555-555555555555'
    await makeUploading(stale)
    await makeUploading(fresh)
    await makeUploading(ready)
    // stale 의 updated_at 을 7시간 전으로, ready 는 ready 상태로(이미 처리됨)
    await db.prisma.$executeRawUnsafe(
      `UPDATE media.assets SET updated_at = now() - interval '7 hours' WHERE id = '${stale}'::uuid`,
    )
    await db.prisma.asset.update({ where: { id: ready }, data: { status: 'ready' } })

    const n = await reapStaleUploads(db.prisma, silent)
    expect(n).toBe(1)

    const rows = await db.prisma.asset.findMany({
      where: { familyId: FAMILY },
      select: { id: true, status: true },
    })
    const byId = new Map(rows.map((r) => [r.id, r.status]))
    expect(byId.get(stale)).toBe('failed')
    expect(byId.get(fresh)).toBe('uploading')
    expect(byId.get(ready)).toBe('ready')
  })
})

describe('reapStuckProcessing', () => {
  // processing 에서 갇히면 예전엔 빠져나올 길이 아예 없었다 — 이 스윕이 uploading 만 봤고
  // 재시도 API 는 failed 만 받았다. failed 로 내려놔야 사용자가 재시도할 수 있다.
  it('오래된 processing 을 failed 로 내려놓는다', async () => {
    const old = new Date(Date.now() - 13 * 60 * 60 * 1000)
    await seedWith('aaaaaaaa-0000-4000-8000-000000000001', 'processing', old)
    const n = await reapStuckProcessing(db.prisma, silent)
    expect(n).toBe(1)
    const row = await db.prisma.asset.findFirst({
      where: { id: 'aaaaaaaa-0000-4000-8000-000000000001', familyId: FAMILY },
    })
    expect(row?.status).toBe('failed')
    expect(row?.processingError).toContain('다시 시도')
  })

  it('최근 것은 건드리지 않는다 — 큰 영상은 정상적으로 오래 걸린다', async () => {
    await seedWith('aaaaaaaa-0000-4000-8000-000000000002', 'processing', new Date())
    expect(await reapStuckProcessing(db.prisma, silent)).toBe(0)
  })

  it('uploading 은 이 스윕이 건드리지 않는다', async () => {
    const old = new Date(Date.now() - 13 * 60 * 60 * 1000)
    await seedWith('aaaaaaaa-0000-4000-8000-000000000003', 'uploading', old)
    expect(await reapStuckProcessing(db.prisma, silent)).toBe(0)
  })
})
