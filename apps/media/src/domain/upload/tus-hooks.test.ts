import fs from 'node:fs'
import { writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { UploadTokenPayload } from '@/lib/jwt'
import type { Upload } from '@tus/server'
import type { Queue } from 'bullmq'
import type pino from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onUploadFinishMedia } from './tus-hooks'

describe('onUploadFinishMedia — maxBytes reject', () => {
  let storageDir: string
  let prevStorage: string | undefined
  beforeEach(() => {
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bebe-tushook-'))
    fs.mkdirSync(path.join(storageDir, 'tus-tmp'), { recursive: true })
    prevStorage = process.env.STORAGE_PATH
    process.env.STORAGE_PATH = storageDir
  })
  afterEach(() => {
    fs.rmSync(storageDir, { recursive: true, force: true })
    if (prevStorage === undefined) delete process.env.STORAGE_PATH
    else process.env.STORAGE_PATH = prevStorage
  })

  const silentLogger = { warn: vi.fn(), info: vi.fn() } as unknown as pino.Logger

  it('rejects an oversize upload and removes the tus-tmp bytes', async () => {
    const assetId = 'over-asset'
    const tmpFile = path.join(storageDir, 'tus-tmp', assetId)
    await writeFile(tmpFile, 'x'.repeat(1000))

    const token = {
      assetId,
      familyId: 'fam-1',
      maxBytes: 10,
    } as unknown as UploadTokenPayload
    const prisma = {
      asset: {
        findFirst: vi.fn(async () => ({
          originalKey: 'families/fam-1/assets/over-asset/original',
        })),
        update: vi.fn(async () => ({})),
      },
    }
    const queue = { add: vi.fn(async () => ({})) } as unknown as Queue

    await expect(
      onUploadFinishMedia({
        upload: { size: 1000, offset: 1000 } as unknown as Upload,
        token,
        // biome-ignore lint/suspicious/noExplicitAny: minimal prisma fake
        prisma: prisma as any,
        queue,
        logger: silentLogger,
      }),
    ).rejects.toThrow(/maxBytes/)

    expect(fs.existsSync(tmpFile)).toBe(false)
    expect(queue.add).not.toHaveBeenCalled()
  })
})
