import { Readable } from 'node:stream'
import type { StorageAdapter } from '@bebe/storage'
import type pino from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { applyDedup } from './dedup'

const silentLogger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as pino.Logger

function p2002() {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
}

// biome-ignore lint/suspicious/noExplicitAny: minimal fakes for the dedup branch
type Any = any

describe('applyDedup — duplicate of a soft-deleted asset', () => {
  it('reclaims the dedup slot and continues (keeps bytes) when the colliding asset is soft-deleted', async () => {
    // 사용자가 지웠던 사진을 다시 올리면 삭제된 행이 (familyId, sha256) 슬롯을 점유해
    // P2002 가 나는데, ready canonical 은 없다. 옛 슬롯을 비우고 새 자산으로 진행해야 한다.
    const asset = { id: 'asset-new', familyId: 'fam-1', kind: 'image', originalKey: 'k-new' } as Any
    let calls = 0
    const updates: Any[] = []
    const prisma = {
      asset: {
        update: vi.fn(async ({ where, data }: Any) => {
          calls += 1
          updates.push({ where, data })
          if (calls === 1) throw p2002() // 최초 real sha256 set 이 충돌
          return {}
        }),
        findFirst: vi.fn(async ({ where }: Any) => {
          if (where.status === 'ready') return null // 살아있는 ready 원본 없음
          return { id: 'asset-old', deletedAt: new Date('2026-06-04T03:14:38Z') } // 소프트삭제 충돌행
        }),
      },
    }
    const storage = {
      read: vi.fn(async () => Readable.from([Buffer.from('same-bytes')])),
      delete: vi.fn(async () => {}),
    } as unknown as StorageAdapter

    const result = await applyDedup({
      asset,
      prisma: prisma as Any,
      storage,
      publishProgress: async () => {},
      logger: silentLogger,
    })

    expect(result).toBe('continue')
    expect(prisma.asset.update).toHaveBeenCalledTimes(3)
    expect(updates[1].where.id).toBe('asset-old') // 점유 슬롯 비움
    expect(updates[1].data.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(updates[2].where.id).toBe('asset-new') // 새 자산이 슬롯 차지
    expect(storage.delete).not.toHaveBeenCalled() // 새 바이트는 보존
  })

  it('marks failed (discards bytes) when no canonical and the colliding asset is live', async () => {
    const asset = { id: 'asset-new', familyId: 'fam-1', kind: 'image', originalKey: 'k-new' } as Any
    let calls = 0
    const updates: Any[] = []
    const prisma = {
      asset: {
        update: vi.fn(async ({ data }: Any) => {
          calls += 1
          updates.push(data)
          if (calls === 1) throw p2002()
          return {}
        }),
        findFirst: vi.fn(async ({ where }: Any) => {
          if (where.status === 'ready') return null
          return { id: 'asset-live', deletedAt: null } // 살아있지만 아직 ready 아님(경쟁)
        }),
      },
    }
    const storage = {
      read: vi.fn(async () => Readable.from([Buffer.from('b')])),
      delete: vi.fn(async () => {}),
    } as unknown as StorageAdapter

    const result = await applyDedup({
      asset,
      prisma: prisma as Any,
      storage,
      publishProgress: async () => {},
      logger: silentLogger,
    })

    expect(result).toBe('handled')
    expect(updates.some((d) => d.status === 'failed')).toBe(true)
    expect(storage.delete).toHaveBeenCalled()
  })
})
