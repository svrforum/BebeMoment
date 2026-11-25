import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { closeWithGrace, shutdownGraceMs } from './graceful-shutdown'

// run-app.sh 가 SIGTERM 뒤 이 시간이 지나면 세 프로세스를 SIGKILL 한다.
function supervisorGraceMs(): number {
  const script = readFileSync(path.join(process.cwd(), '../../docker/run-app.sh'), 'utf8')
  const m = script.match(/APP_SHUTDOWN_GRACE_S:-(\d+)/)
  if (!m?.[1]) throw new Error('APP_SHUTDOWN_GRACE_S default not found in run-app.sh')
  return Number(m[1]) * 1000
}

describe('shutdownGraceMs', () => {
  it('defaults to thirty seconds and honours a positive override', () => {
    expect(shutdownGraceMs(undefined)).toBe(30_000)
    expect(shutdownGraceMs('1500')).toBe(1500)
    expect(shutdownGraceMs('nope')).toBe(30_000)
    expect(shutdownGraceMs('0')).toBe(30_000)
  })

  it('leaves the worker time to force-close before the supervisor kills it', () => {
    // 상한을 넘기면 워커는 강제 close·큐 close·Redis 끊기를 더 한다 — 그 몫으로 10초를 남긴다.
    expect(shutdownGraceMs(undefined) + 10_000).toBeLessThanOrEqual(supervisorGraceMs())
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
