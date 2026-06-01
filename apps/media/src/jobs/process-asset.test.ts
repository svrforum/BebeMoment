import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { NotificationJob } from '@bebe/core'
import { createAdapter, type StorageAdapter } from '@bebe/storage'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    const enqueue = vi.fn<(job: NotificationJob) => Promise<void>>(async () => {})

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
    const enqueue = vi.fn<(job: NotificationJob) => Promise<void>>(async () => {})

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

  describe('convert path (convertToCompatible)', () => {
    let dir: string
    let prevAvif: string | undefined
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bebe-pa-cvt-'))
      prevAvif = process.env.MEDIA_DERIVATIVES_INCLUDE_AVIF
      process.env.MEDIA_DERIVATIVES_INCLUDE_AVIF = 'false'
    })
    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true })
      if (prevAvif === undefined) delete process.env.MEDIA_DERIVATIVES_INCLUDE_AVIF
      else process.env.MEDIA_DERIVATIVES_INCLUDE_AVIF = prevAvif
    })

    it('deletes the old original only after the successful commit (original replaced)', async () => {
      const adapter = createAdapter({ mode: 'local', path: dir })
      const oldKey = 'orig/asset-cvt.heic'
      const sample = await sharp({
        create: { width: 64, height: 48, channels: 3, background: '#102030' },
      })
        .jpeg()
        .toBuffer()
      await adapter.writeBuffer(oldKey, sample, 'image/heic')

      const asset = fakeAsset({
        id: 'asset-cvt',
        kind: 'image',
        originalKey: oldKey,
        mimeType: 'image/heic',
        originalFilename: 'x.heic',
      })
      const updates: Record<string, unknown>[] = []
      const prisma = {
        asset: {
          findFirst: vi.fn(async () => asset),
          update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
            updates.push(data)
            return asset
          }),
        },
      }

      await processAsset({
        job: {
          type: 'process-asset',
          assetId: asset.id,
          familyId: asset.familyId,
          convertToCompatible: true,
        },
        // biome-ignore lint/suspicious/noExplicitAny: minimal prisma fake
        prisma: prisma as any,
        storage: adapter,
        publishProgress: async () => {},
        logger: silentLogger,
        enqueueNotification: async () => {},
      })

      const ready = updates.find((u) => u.status === 'ready')
      expect(ready?.originalKey).toBe(`${oldKey}.converted.jpg`)
      // converted survives, old original is replaced (deleted) after success
      expect(fs.existsSync(path.join(dir, `${oldKey}.converted.jpg`))).toBe(true)
      expect(fs.existsSync(path.join(dir, oldKey))).toBe(false)
    }, 30_000)
  })
})
