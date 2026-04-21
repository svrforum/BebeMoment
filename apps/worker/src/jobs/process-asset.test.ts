import { describe, expect, it } from 'vitest'

describe('process-asset module', () => {
  it('exports processAsset', async () => {
    const mod = await import('./process-asset')
    expect(mod.processAsset).toBeDefined()
  })
})
