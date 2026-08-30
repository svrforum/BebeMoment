import { describe, expect, it, vi } from 'vitest'
import { rollbackAssets } from './rollback-assets'

const ok = () => Promise.resolve({ ok: true } as Response)

describe('rollbackAssets', () => {
  it('올라간 사진을 전부 되돌린다 — 쓴 적 없는 스토리의 사진이 남으면 안 된다', async () => {
    const calls: string[] = []
    const f = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      calls.push(`${String(url)} ${init?.method}`)
      return ok()
    }) as unknown as typeof fetch
    const r = await rollbackAssets(['a1', 'a2', 'a3'], f)
    expect(r).toEqual({ removed: 3, failed: [] })
    expect(calls).toEqual([
      '/api/asset/a1/delete POST',
      '/api/asset/a2/delete POST',
      '/api/asset/a3/delete POST',
    ])
  })

  it('되돌리지 못한 것은 삼키지 않고 돌려준다', async () => {
    const f = vi.fn((url: string | URL | Request) =>
      Promise.resolve({ ok: !String(url).includes('bad') } as Response),
    ) as unknown as typeof fetch
    const r = await rollbackAssets(['good', 'bad'], f)
    expect(r.removed).toBe(1)
    expect(r.failed).toEqual(['bad'])
  })

  it('네트워크가 끊겨도 던지지 않는다 — 되돌림 실패가 원래 에러를 덮으면 안 된다', async () => {
    const f = vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch
    const r = await rollbackAssets(['a', 'b'], f)
    expect(r).toEqual({ removed: 0, failed: ['a', 'b'] })
  })

  it('되돌릴 게 없으면 아무것도 부르지 않는다', async () => {
    const f = vi.fn(ok) as unknown as typeof fetch
    expect(await rollbackAssets([], f)).toEqual({ removed: 0, failed: [] })
    expect(f).not.toHaveBeenCalled()
  })
})
