import { afterEach, describe, expect, it, vi } from 'vitest'

const { ctor } = vi.hoisted(() => ({ ctor: vi.fn() }))
vi.mock('ioredis', () => ({ default: ctor }))

import { createRedisConnection, createRedisSubscriber } from './redis'

afterEach(() => {
  ctor.mockReset()
  delete process.env.REDIS_URL
})

describe('createRedisConnection', () => {
  it('명시 url 을 우선 사용하고 maxRetriesPerRequest=null 로 연결한다', () => {
    createRedisConnection('redis://explicit:6379')
    expect(ctor).toHaveBeenCalledWith('redis://explicit:6379', { maxRetriesPerRequest: null })
  })

  it('url 미지정 시 REDIS_URL 환경변수를 쓴다', () => {
    process.env.REDIS_URL = 'redis://from-env:6379'
    createRedisConnection()
    expect(ctor).toHaveBeenCalledWith('redis://from-env:6379', { maxRetriesPerRequest: null })
  })

  it('아무것도 없으면 localhost 기본값으로 폴백한다', () => {
    delete process.env.REDIS_URL
    createRedisConnection()
    expect(ctor).toHaveBeenCalledWith('redis://localhost:6379', { maxRetriesPerRequest: null })
  })
})

describe('createRedisSubscriber', () => {
  it('명령용 연결과 같은 옵션을 쓴다 — 옵션이 두 군데서 갈리지 않게', () => {
    createRedisConnection('redis://x:6379')
    createRedisSubscriber('redis://x:6379')
    expect(ctor.mock.calls[1]).toEqual(ctor.mock.calls[0])
  })

  it('호출할 때마다 새 인스턴스를 만든다(구독자는 연결을 공유하지 않는다)', () => {
    createRedisSubscriber('redis://x:6379')
    createRedisSubscriber('redis://x:6379')
    expect(ctor).toHaveBeenCalledTimes(2)
  })
})
