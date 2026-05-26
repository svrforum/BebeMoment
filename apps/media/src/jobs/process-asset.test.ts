import type { NotificationJob } from '@bebe/core'
import type { StorageAdapter } from '@bebe/storage'
import type pino from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { processAsset } from './process-asset'

describe('process-asset module', () => {
  it('exports processAsset', async () => {
    const mod = await import('./process-asset')
    expect(mod.processAsset).toBeDefined()
  })

  function fakeAsset(overrides: Record<string, unknown> = {}) {
    return {
      id: 'asset-1',
      familyId: 'fam-1',
      uploadedByUserId: 'user-1',
      status: 'processing',
      // 'image'/'video' would invoke real sharp/ffmpeg pipelines; using a
      // neutral kind exercises the ready→enqueue path without those deps.
      kind: 'other',
      originalKey: 'k',
      originalFilename: 'x.bin',
      mimeType: 'application/octet-stream',
      sizeBytes: 1n,
      uploadedAt: new Date(),
      ...overrides,
    }
  }

  function fakePrisma(asset: ReturnType<typeof fakeAsset>) {
    return {
      asset: {
        findFirst: vi.fn(async () => asset),
        update: vi.fn(async () => asset),
      },
    }
  }

  const noopStorage = {} as StorageAdapter
  const silentLogger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as pino.Logger

  it('enqueues asset.uploaded after the asset is marked ready', async () => {
    const asset = fakeAsset()
    const prisma = fakePrisma(asset)
    const enqueue = vi.fn<[NotificationJob], Promise<void>>(async () => {})

    await processAsset({
      job: {
        type: 'process-asset',
        assetId: asset.id,
        familyId: asset.familyId,
        convertToCompatible: false,
      },
      // biome-ignore lint/suspicious/noExplicitAny: minimal prisma fake
      prisma: prisma as any,
      storage: noopStorage,
      publishProgress: async () => {},
      logger: silentLogger,
      enqueueNotification: enqueue,
    })

    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(enqueue).toHaveBeenCalledWith({
      familyId: asset.familyId,
      actorUserId: asset.uploadedByUserId,
      type: 'asset.uploaded',
      payload: { assetId: asset.id },
    })
  })

  it('does not enqueue when processing fails', async () => {
    const asset = fakeAsset()
    const prisma = fakePrisma(asset)
    prisma.asset.update = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(asset)
    const enqueue = vi.fn<[NotificationJob], Promise<void>>(async () => {})

    await expect(
      processAsset({
        job: {
          type: 'process-asset',
          assetId: asset.id,
          familyId: asset.familyId,
          convertToCompatible: false,
        },
        // biome-ignore lint/suspicious/noExplicitAny: minimal prisma fake
        prisma: prisma as any,
        storage: noopStorage,
        publishProgress: async () => {},
        logger: silentLogger,
        enqueueNotification: enqueue,
      }),
    ).rejects.toThrow('boom')

    expect(enqueue).not.toHaveBeenCalled()
  })
})
