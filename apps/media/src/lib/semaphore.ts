export class Semaphore {
  private readonly waiters: Array<() => void> = []
  private inUse = 0

  constructor(private readonly max: number) {
    if (!(max >= 1)) throw new Error('Semaphore max must be >= 1')
  }

  get active(): number {
    return this.inUse
  }

  get pending(): number {
    return this.waiters.length
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire()
    try {
      return await fn()
    } finally {
      release()
    }
  }

  /** 빈 슬롯이 없으면 기다리지 않고 null — 요청 경로에서 503 으로 거절할 때. */
  tryRun<T>(fn: () => Promise<T>): Promise<T> | null {
    const release = this.tryAcquire()
    if (!release) return null
    return fn().finally(release)
  }

  /** 슬롯을 즉시 잡거나 null. 반환된 release 는 여러 번 불러도 한 번만 푼다 — 스트림 종료
   *  경로가 여럿(close/error)인 호출자를 위해. */
  tryAcquire(): (() => void) | null {
    if (this.inUse >= this.max) return null
    this.inUse += 1
    return this.releaser()
  }

  private async acquire(): Promise<() => void> {
    if (this.inUse < this.max) {
      this.inUse += 1
    } else {
      // release() 가 슬롯을 넘겨주며 깨운다 — inUse 는 그대로 유지된다.
      await new Promise<void>((resolve) => this.waiters.push(resolve))
    }
    return this.releaser()
  }

  private releaser(): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      const next = this.waiters.shift()
      if (next) next()
      else this.inUse -= 1
    }
  }
}
