import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createAlbum } from './create'
import { listAlbums } from './list'

// 실제 캐시처럼 키마다 처음 값을 계속 돌려준다 — 쓰기 직후 한 요청 동안 옛 값을 내는
// stale-while-revalidate 를 흉내 낸다.
const cached = new Map<string, unknown>()
vi.mock('next/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/cache')>()),
  unstable_cache:
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>, keyParts?: string[]) =>
    async (...args: A): Promise<R> => {
      const key = JSON.stringify(keyParts)
      if (!cached.has(key)) cached.set(key, await fn(...args))
      return cached.get(key) as R
    },
}))

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})

describe('listAlbums photo counts with a cached album list', () => {
  it('counts photos from the same moment as the hidden set, so a stale cache cannot go negative or leak', async () => {
    const { user } = await signup(
      { email: 'album-cache@b.com', password: 'password123', displayName: 'T' },
      db.prismaPublic,
    )
    const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
    const album = await createAlbum(
      { familyId: family.id, byUserId: user.id, name: 'Empty' },
      db.prismaPublic,
    )
    const args = { familyId: family.id, parentId: null, viewerRole: 'family' as const }

    const before = await listAlbums(args, db.prismaPublic)
    expect(before.find((a) => a.id === album.id)?.assetCount).toBe(0)

    // 보호자가 비밀 스토리 사진 한 장을 앨범에 담는다 — 캐시된 목록은 아직 비워지지 않았다.
    const secret = await db.prismaMedia.asset.create({
      data: {
        familyId: family.id,
        uploadedByUserId: user.id,
        kind: 'image',
        originalKey: 'k-cache-secret',
        originalFilename: 'y.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1n,
        sha256: 'c'.repeat(64),
        takenAt: new Date('2026-04-02'),
        takenAtSource: 'uploaded',
        status: 'ready',
      },
    })
    await db.prismaPublic.story.create({
      data: {
        familyId: family.id,
        entryDate: new Date('2026-04-02'),
        body: 'b',
        visibility: 'guardians',
        createdByUserId: user.id,
        assets: { create: [{ assetId: secret.id, order: 0 }] },
      },
    })
    await db.prismaPublic.albumAsset.create({
      data: { albumId: album.id, familyId: family.id, assetId: secret.id, addedByUserId: user.id },
    })

    const familyView = await listAlbums(args, db.prismaPublic)
    expect(familyView.find((a) => a.id === album.id)?.assetCount).toBe(0)
    const ownerView = await listAlbums({ ...args, viewerRole: 'owner' }, db.prismaPublic)
    expect(ownerView.find((a) => a.id === album.id)?.assetCount).toBe(1)
  })
})
