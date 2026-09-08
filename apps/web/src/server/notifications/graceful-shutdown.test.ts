import { describe, expect, it } from 'vitest'
import { closeWithGrace, shutdownGraceMs } from './graceful-shutdown'

describe('shutdownGraceMs', () => {
  it('defaults to five minutes and honours a positive override', () => {
    expect(shutdownGraceMs(undefined)).toBe(5 * 60 * 1000)
    expect(shutdownGraceMs('1500')).toBe(1500)
    expect(shutdownGraceMs('nope')).toBe(5 * 60 * 1000)
    expect(shutdownGraceMs('0')).toBe(5 * 60 * 1000)
  })
})

describe('closeWithGrace', () => {
  it('resolves closed once every closer finished', async () => {
    const order: string[] = []
    const result = await closeWithGrace(
      [
        async () => {
          await new Promise((r) => setTimeout(r, 5))
          order.push('a')
        },
        async () => {
          order.push('b')
        },
      ],
      1000,
    )
    expect(result).toBe('closed')
    expect(order.sort()).toEqual(['a', 'b'])
  })

  it('gives up after the grace period when a closer never returns', async () => {
    const result = await closeWithGrace([() => new Promise(() => {})], 20)
    expect(result).toBe('timed-out')
  })
})
