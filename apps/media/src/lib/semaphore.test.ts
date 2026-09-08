import { describe, expect, it } from 'vitest'
import { Semaphore } from './semaphore'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('Semaphore', () => {
  it('runs at most max tasks at once and queues the rest in order', async () => {
    const sem = new Semaphore(2)
    const gates = [deferred(), deferred(), deferred()]
    const order: number[] = []
    let active = 0
    let maxActive = 0
    const tasks = gates.map((g, i) =>
      sem.run(async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        order.push(i)
        await g.promise
        active -= 1
      }),
    )
    await Promise.resolve()
    expect(order).toEqual([0, 1])
    expect(sem.active).toBe(2)
    expect(sem.pending).toBe(1)
    gates[0]?.resolve()
    await tasks[0]
    await Promise.resolve()
    expect(order).toEqual([0, 1, 2])
    gates[1]?.resolve()
    gates[2]?.resolve()
    await Promise.all(tasks)
    expect(maxActive).toBe(2)
    expect(sem.active).toBe(0)
  })

  it('releases the slot when the task throws', async () => {
    const sem = new Semaphore(1)
    await expect(sem.run(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    expect(sem.active).toBe(0)
    await expect(sem.run(async () => 42)).resolves.toBe(42)
  })

  it('tryRun returns null instead of queueing when every slot is busy', async () => {
    const sem = new Semaphore(1)
    const gate = deferred()
    const first = sem.run(() => gate.promise)
    expect(sem.tryRun(async () => 1)).toBeNull()
    gate.resolve()
    await first
    await expect(sem.tryRun(async () => 1)).resolves.toBe(1)
  })
})
