import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { NotificationJob } from '@bebe/core'
import { createAdapter, type StorageAdapter } from '@bebe/storage'
import type pino from 'pino'
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

  // taken_at 은 벽시계를 UTC 필드에 담는다. 운영 컨테이너는 TZ=Asia/Seoul 이다.
  describe('촬영 시각 폴백 — 인스턴스 시간대가 Asia/Seoul 일 때', () => {
    let savedTz: string | undefined
    beforeEach(() => {
      savedTz = process.env.TZ
      process.env.TZ = 'Asia/Seoul'
    })
    afterEach(() => {
      if (savedTz === undefined) delete process.env.TZ
      else process.env.TZ = savedTz
    })

    async function storedTakenAt(asset: ReturnType<typeof fakeAsset>) {
      const prisma = fakePrisma(asset)
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
        enqueueNotification: vi.fn(async () => {}),
      })
      const calls = (prisma.asset.update as unknown as { mock: { calls: unknown[][] } }).mock.calls
      return calls
        .map((c) => (c[0] as { data: unknown }).data)
        .find(
          (d): d is { takenAt: Date; takenAtSource: string; fileModifiedAt?: Date } =>
            typeof d === 'object' && d !== null && 'takenAtSource' in d,
        )
    }

    it('날짜가 하나도 없으면 업로드 시각을 벽시계로 옮겨 쓴다', async () => {
      // 2026-10-12 07:44 KST 에 올린 파일 — uploaded_at 은 실제 순간이라 전날 22:44Z 다.
      const stored = await storedTakenAt(
        fakeAsset({
          takenAtSource: 'uploaded',
          takenAt: new Date('2026-10-11T22:44:00Z'),
          uploadedAt: new Date('2026-10-11T22:44:00Z'),
          originalFilename: 'IMG_no_date.jpg',
        }),
      )
      expect(stored?.takenAtSource).toBe('uploaded')
      expect(stored?.takenAt.toISOString()).toBe('2026-10-12T07:44:00.000Z')
    })

    it('EXIF·파일명 날짜가 없으면 파일 수정시각(실제 순간)을 벽시계로 옮겨 쓴다 — 재처리해도 같다', async () => {
      // 2026-10-12 07:44 KST 에 수정된 파일. init 이 실제 순간과 벽시계 씨앗을 함께 심어 뒀다.
      const asset = fakeAsset({
        takenAtSource: 'filemtime',
        takenAt: new Date('2026-10-12T07:44:00Z'),
        fileModifiedAt: new Date('2026-10-11T22:44:00Z'),
        uploadedAt: new Date('2026-10-12T01:00:00Z'),
        originalFilename: 'IMG_no_date.jpg',
      })
      const stored = await storedTakenAt(asset)
      expect(stored?.takenAtSource).toBe('filemtime')
      expect(stored?.takenAt.toISOString()).toBe('2026-10-12T07:44:00.000Z')
      expect(stored?.fileModifiedAt).toBeUndefined()
    })

    it('2026-10 전 init 이 실제 순간을 taken_at 에 넣은 행은 그 순간을 남기고 벽시계로 옮긴다', async () => {
      const stored = await storedTakenAt(
        fakeAsset({
          takenAtSource: 'filemtime',
          takenAt: new Date('2026-10-11T22:44:00Z'),
          fileModifiedAt: null,
          uploadedAt: new Date('2026-10-12T01:00:00Z'),
          originalFilename: 'IMG_no_date.jpg',
        }),
      )
      expect(stored?.takenAtSource).toBe('filemtime')
      expect(stored?.takenAt.toISOString()).toBe('2026-10-12T07:44:00.000Z')
      // 다음 재처리는 이 값에서 다시 계산한다 — 옮긴 값을 또 옮기지 않게.
      expect(stored?.fileModifiedAt?.toISOString()).toBe('2026-10-11T22:44:00.000Z')
    })
  })

  it('still enqueues asset.uploaded with suppressPush when job.notify is false (story photo)', async () => {
    // 스토리 첨부 사진: 잡은 보내되(얼굴 인식 등 유지) payload.suppressPush 로 워커가 푸시만 생략.
    const asset = fakeAsset()
    const prisma = fakePrisma(asset)
    const enqueue = vi.fn<(job: NotificationJob) => Promise<void>>(async () => {})

    await processAsset({
      job: {
        type: 'process-asset',
        assetId: asset.id,
        familyId: asset.familyId,
        convertToCompatible: false,
        notify: false,
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
      payload: { assetId: asset.id, suppressPush: 'true' },
    })
  })

  it('resets sha256 to a fresh placeholder when marking failed (no dedup-slot squat)', async () => {
    // 처리 실패한 자산이 real sha256 을 들고 failed 로 남으면 (familyId, sha256)
    // 유니크 슬롯을 영구 점유 → 같은 사진 재업로드가 거짓 '중복'으로 막힌다.
    // 실패 커밋은 sha256 을 무작위 placeholder 로 되돌려 슬롯을 비워야 한다.
    const asset = fakeAsset()
    const updates: Record<string, unknown>[] = []
    const prisma = {
      asset: {
        findFirst: vi.fn(async () => asset),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data)
          if (data.status === 'ready') throw new Error('derivative boom')
          return asset
        }),
      },
    }

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
        enqueueNotification: async () => {},
      }),
    ).rejects.toThrow('derivative boom')

    const failed = updates.find((u) => u.status === 'failed')
    expect(failed).toBeDefined()
    expect(failed?.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('best-effort deletes derivative keys on the final failed attempt (no orphan leak)', async () => {
    const asset = fakeAsset({ id: 'asset-orph' })
    const deleted: string[] = []
    const storage = {
      delete: vi.fn(async (k: string) => {
        deleted.push(k)
      }),
    } as unknown as StorageAdapter
    const prisma = {
      asset: {
        findFirst: vi.fn(async () => asset),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          if (data.status === 'ready') throw new Error('boom')
          return asset
        }),
      },
    }

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
        storage,
        publishProgress: async () => {},
        logger: silentLogger,
        enqueueNotification: async () => {},
        isFinalAttempt: true,
      }),
    ).rejects.toThrow('boom')

    expect(deleted).toContain('derivatives/asset-orph/thumb256.webp')
    expect(deleted).toContain('derivatives/asset-orph/display1080.jpeg')
    expect(deleted).toContain('derivatives/asset-orph/poster.jpg')
  })

  it('does not delete derivatives on a non-final failed attempt (retry reuses them)', async () => {
    const asset = fakeAsset({ id: 'asset-retry' })
    const del = vi.fn(async () => {})
    const storage = { delete: del } as unknown as StorageAdapter
    const prisma = {
      asset: {
        findFirst: vi.fn(async () => asset),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          if (data.status === 'ready') throw new Error('boom')
          return asset
        }),
      },
    }

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
        storage,
        publishProgress: async () => {},
        logger: silentLogger,
        enqueueNotification: async () => {},
        isFinalAttempt: false,
      }),
    ).rejects.toThrow('boom')

    expect(del).not.toHaveBeenCalled()
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
