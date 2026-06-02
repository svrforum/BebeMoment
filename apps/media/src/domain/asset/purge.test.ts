import type { StorageAdapter } from '@bebe/storage'
import { describe, expect, it, vi } from 'vitest'
import { purgeAsset } from './purge'

function fakePrisma(opts: { asset: Record<string, unknown> | null; aliasCount: number }) {
  return {
    asset: {
      findFirst: vi.fn(async () => opts.asset),
      count: vi.fn(async () => opts.aliasCount),
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

describe('purgeAsset — duplicate-alias safety', () => {
  it('does NOT delete shared bytes when a live alias still references them', async () => {
    const deleted: string[] = []
    const storage = {
      delete: vi.fn(async (k: string) => void deleted.push(k)),
    } as unknown as StorageAdapter
    const prisma = fakePrisma({ asset: canonical, aliasCount: 1 })

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

  it('deletes bytes when no alias references them', async () => {
    const storage = { delete: vi.fn(async () => {}) } as unknown as StorageAdapter
    const prisma = fakePrisma({ asset: canonical, aliasCount: 0 })

    await purgeAsset({ assetId: canonical.id, familyId: canonical.familyId }, prisma, storage)

    expect(storage.delete).toHaveBeenCalledWith(canonical.originalKey)
    expect(prisma.asset.delete).toHaveBeenCalled()
  })
})
