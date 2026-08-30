import { describe, expect, it, vi } from 'vitest'
import { purgeMany } from './purge-many'

describe('purgeMany', () => {
  it('하나씩 순서대로 지운다 — 미디어 삭제가 동시에 몰리지 않게', async () => {
    const order: string[] = []
    const purge = vi.fn(async (id: string) => {
      order.push(id)
    })
    const r = await purgeMany(['a', 'b', 'c'], purge)
    expect(order).toEqual(['a', 'b', 'c'])
    expect(r).toEqual({ purged: 3, failed: [] })
  })

  // 한 장이 실패했다고 나머지를 남기면, 사용자는 어느 것이 지워졌는지 모른 채 다시
  // 전체선택을 눌러야 한다. 계속 진행하고 실패한 것만 돌려준다.
  it('중간에 실패해도 나머지를 계속 지우고, 실패한 것만 알려준다', async () => {
    const purge = vi.fn(async (id: string) => {
      if (id === 'b') throw new Error('boom')
    })
    const r = await purgeMany(['a', 'b', 'c'], purge)
    expect(r.purged).toBe(2)
    expect(r.failed).toEqual([{ assetId: 'b', error: 'boom' }])
    expect(purge).toHaveBeenCalledTimes(3)
  })

  it('빈 목록이면 아무것도 부르지 않는다', async () => {
    const purge = vi.fn()
    expect(await purgeMany([], purge)).toEqual({ purged: 0, failed: [] })
    expect(purge).not.toHaveBeenCalled()
  })

  it('중복 id 는 한 번만 지운다', async () => {
    const purge = vi.fn(async () => {})
    const r = await purgeMany(['a', 'a', 'b'], purge)
    expect(purge).toHaveBeenCalledTimes(2)
    expect(r.purged).toBe(2)
  })
})
