import { describe, expect, it, vi } from 'vitest'
import { assertDiskSpaceForUpload, bytesNeededForUpload } from './preflight'

const MB = 1024 * 1024

describe('bytesNeededForUpload', () => {
  it('reserves derivative headroom on local storage but only the tus-tmp copy on s3', () => {
    expect(bytesNeededForUpload(100 * MB, 'local')).toBe(BigInt(150 * MB + 256 * MB))
    expect(bytesNeededForUpload(100 * MB, 's3')).toBe(BigInt(100 * MB + 256 * MB))
  })
})

describe('assertDiskSpaceForUpload', () => {
  const free = (bytes: number) => vi.fn(async () => ({ bavail: bytes / 4096, bsize: 4096 }))

  it('checks the tus-tmp directory regardless of storage mode', async () => {
    const statfs = free(1024 * MB)
    await assertDiskSpaceForUpload(
      { sizeBytes: 10 * MB, mode: 's3', tusTmpDir: '/data/tus-tmp' },
      statfs,
    )
    expect(statfs).toHaveBeenCalledWith('/data/tus-tmp')
  })

  it('rejects when free space is below what the mode needs', async () => {
    // 380 MB free: enough for the s3 staging copy (356 MB), not for local (406 MB).
    await expect(
      assertDiskSpaceForUpload(
        { sizeBytes: 100 * MB, mode: 'local', tusTmpDir: '/data/tus-tmp' },
        free(380 * MB),
      ),
    ).rejects.toThrow(/insufficient disk space/)
    await expect(
      assertDiskSpaceForUpload(
        { sizeBytes: 100 * MB, mode: 's3', tusTmpDir: '/data/tus-tmp' },
        free(380 * MB),
      ),
    ).resolves.toBeUndefined()
  })

  it('lets the upload through when statfs itself fails (availability first)', async () => {
    await expect(
      assertDiskSpaceForUpload(
        { sizeBytes: 100 * MB, mode: 'local', tusTmpDir: '/nope' },
        vi.fn(async () => {
          throw new Error('ENOSYS')
        }),
      ),
    ).resolves.toBeUndefined()
  })
})
