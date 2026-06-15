import { describe, expect, it } from 'vitest'
import { collectAssetIds } from './collect-asset-ids'

describe('collectAssetIds', () => {
  it('returns all assetIds once every file has one', async () => {
    const files = [
      { id: 'a', meta: { assetId: 'A' } },
      { id: 'b', meta: { assetId: 'B' } },
    ]
    const out = await collectAssetIds(() => files, ['a', 'b'], { intervalMs: 5 })
    expect(out).toEqual(['A', 'B'])
  })

  it('resolves as soon as ids appear (no fixed wait)', async () => {
    const files: { id: string; meta?: { assetId?: string } }[] = [{ id: 'a' }]
    setTimeout(() => {
      files[0] = { id: 'a', meta: { assetId: 'A' } }
    }, 10)
    const out = await collectAssetIds(() => files, ['a'], { intervalMs: 5, timeoutMs: 2000 })
    expect(out).toEqual(['A'])
  })

  it('returns only the resolved ones when the deadline passes (partial)', async () => {
    const files = [{ id: 'a', meta: { assetId: 'A' } }, { id: 'b' }]
    const out = await collectAssetIds(() => files, ['a', 'b'], { intervalMs: 5, timeoutMs: 30 })
    expect(out).toEqual(['A'])
  })
})
