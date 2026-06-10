import type { StorageAdapter } from '@bebe/storage'
import { describe, expect, it, vi } from 'vitest'
import { purgeAsset } from './purge'

// count 는 "같은 originalKey 를 가진 다른 보유자 수"(키 공유 refcount). otherHolders>0 이면
// 바이트를 공유 중이라 보존, 0 이면 마지막 보유자라 삭제한다.
function fakePrisma(opts: { asset: Record<string, unknown> | null; otherHolders: number }) {
  return {
    asset: {
      findFirst: vi.fn(async () => opts.asset),
      count: vi.fn(async () => opts.otherHolders),
      delete: vi.fn(async () => ({})),
    },
    // biome-ignore lint/suspicious/noExplicitAny: minimal fake
  } as any
}

const canonical = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  familyId: 'fam-1',
  deletedAt: new Date(),
  originalKey: 'families/fam-1/assets/aaa/original',
  derivatives: null,
}

// 별칭은 canonical 의 originalKey 를 그대로 복사해 가진다(dedup).
const alias = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  familyId: 'fam-1',
  duplicateOf: canonical.id,
  deletedAt: new Date(),
  originalKey: canonical.originalKey,
  derivatives: null,
}

describe('purgeAsset — shared-bytes safety', () => {
  it('does NOT delete shared bytes when another row still references them', async () => {
    const deleted: string[] = []
    const storage = {
      delete: vi.fn(async (k: string) => void deleted.push(k)),
    } as unknown as StorageAdapter
    const prisma = fakePrisma({ asset: canonical, otherHolders: 1 })

    const res = await purgeAsset(
      { assetId: canonical.id, familyId: canonical.familyId },
      prisma,
      storage,
    )

    expect(storage.delete).not.toHaveBeenCalled()
    expect(deleted).toEqual([])
    // 행은 여전히 하드삭제(휴지통에서 제거)되어야 한다.
    expect(prisma.asset.delete).toHaveBeenCalled()
    expect(res.deletedKeys).toEqual([])
  })

  it('does NOT delete canonical bytes when purging an alias that copies the key', async () => {
    // 핵심 회귀: 별칭을 영구삭제할 때 canonical 의 공유 바이트를 지우면 안 된다.
    const storage = { delete: vi.fn(async () => {}) } as unknown as StorageAdapter
    const prisma = fakePrisma({ asset: alias, otherHolders: 1 })

    const res = await purgeAsset({ assetId: alias.id, familyId: alias.familyId }, prisma, storage)

    expect(storage.delete).not.toHaveBeenCalled()
    expect(prisma.asset.delete).toHaveBeenCalled()
    expect(res.deletedKeys).toEqual([])
  })

  it('deletes bytes when this is the last holder', async () => {
    const storage = { delete: vi.fn(async () => {}) } as unknown as StorageAdapter
    const prisma = fakePrisma({ asset: canonical, otherHolders: 0 })

    await purgeAsset({ assetId: canonical.id, familyId: canonical.familyId }, prisma, storage)

    expect(storage.delete).toHaveBeenCalledWith(canonical.originalKey)
    expect(prisma.asset.delete).toHaveBeenCalled()
  })
})
