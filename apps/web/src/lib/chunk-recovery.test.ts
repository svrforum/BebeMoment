import { describe, expect, it } from 'vitest'
import { STALE_RELOAD_KEY, isChunkLoadError, shouldReload } from './chunk-recovery'

describe('isChunkLoadError', () => {
  it('웹팩/Next 가 내는 청크 로드 실패를 알아본다', () => {
    expect(isChunkLoadError(new Error('Loading chunk 42 failed.'))).toBe(true)
    expect(
      isChunkLoadError(
        new Error('Failed to load chunk /_next/static/chunks/0adm3.js from module 1'),
      ),
    ).toBe(true)
    const named = new Error('boom')
    named.name = 'ChunkLoadError'
    expect(isChunkLoadError(named)).toBe(true)
  })

  it('동적 import 실패 문구도 잡는다', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: /x.js'))).toBe(
      true,
    )
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true)
  })

  it('평범한 에러는 건드리지 않는다 — 새로고침은 마지막 수단이다', () => {
    expect(isChunkLoadError(new Error('Unauthorized'))).toBe(false)
    expect(isChunkLoadError(new TypeError('x is not a function'))).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
    expect(isChunkLoadError('Loading chunk failed')).toBe(false)
  })
})

describe('shouldReload', () => {
  const now = 1_700_000_000_000

  it('처음 마주치면 새로고침한다', () => {
    expect(shouldReload(now, null)).toBe(true)
  })

  it('방금 새로고침했으면 다시 하지 않는다 — 무한 새로고침을 만들지 않는다', () => {
    expect(shouldReload(now, String(now - 5_000))).toBe(false)
  })

  it('한참 지난 뒤 또 배포되면 다시 새로고침한다', () => {
    expect(shouldReload(now, String(now - 10 * 60 * 1000))).toBe(true)
  })

  it('저장값이 망가져 있으면 새로고침한다', () => {
    expect(shouldReload(now, 'garbage')).toBe(true)
  })

  it('미래 시각이 저장돼 있어도 갇히지 않는다', () => {
    expect(shouldReload(now, String(now + 60_000))).toBe(true)
  })
})

describe('STALE_RELOAD_KEY', () => {
  it('앱 저장소 이름 규칙을 따른다', () => {
    expect(STALE_RELOAD_KEY.startsWith('bebe.')).toBe(true)
  })
})
