import type { AssetEvent } from '@bebe/core'
import { describe, expect, it } from 'vitest'
import {
  AT_TOP_SCROLL_PX,
  NO_PENDING,
  classifyEvent,
  hasPending,
  pendingLabelCount,
  receiveEvent,
  shouldApplyImmediately,
  withPending,
} from './live-refresh'

const updated = (status: 'processing' | 'ready' | 'failed'): AssetEvent => ({
  type: 'asset.updated',
  familyId: 'f1',
  assetId: 'a1',
  status,
})

describe('classifyEvent', () => {
  it('counts a settled upload as an added photo', () => {
    expect(classifyEvent(updated('ready'))).toBe('added')
  })

  it('counts a deletion or a failure as a change, not a new photo', () => {
    expect(classifyEvent({ type: 'asset.deleted', familyId: 'f1', assetId: 'a1' })).toBe('changed')
    expect(classifyEvent(updated('failed'))).toBe('changed')
  })

  it('ignores in-flight processing and social events', () => {
    expect(classifyEvent(updated('processing'))).toBeNull()
    expect(
      classifyEvent({
        type: 'like.changed',
        familyId: 'f1',
        assetId: 'a1',
        userId: 'u1',
        liked: true,
      }),
    ).toBeNull()
    expect(
      classifyEvent({ type: 'comment.added', familyId: 'f1', assetId: 'a1', commentId: 'c1' }),
    ).toBeNull()
  })
})

describe('shouldApplyImmediately', () => {
  it('applies while the viewer is effectively at the top of the first page', () => {
    expect(shouldApplyImmediately({ scrollY: 0, pagesLoaded: 1 })).toBe(true)
    expect(shouldApplyImmediately({ scrollY: AT_TOP_SCROLL_PX - 1, pagesLoaded: 1 })).toBe(true)
  })

  it('holds back once the viewer has scrolled away from the top', () => {
    expect(shouldApplyImmediately({ scrollY: AT_TOP_SCROLL_PX, pagesLoaded: 1 })).toBe(false)
    expect(shouldApplyImmediately({ scrollY: 8000, pagesLoaded: 1 })).toBe(false)
  })

  it('holds back once more pages are loaded, even back at the top', () => {
    expect(shouldApplyImmediately({ scrollY: 0, pagesLoaded: 2 })).toBe(false)
  })
})

describe('pending changes', () => {
  it('starts empty', () => {
    expect(hasPending(NO_PENDING)).toBe(false)
    expect(pendingLabelCount(NO_PENDING)).toBe(0)
  })

  it('counts added photos separately from other changes', () => {
    let p = withPending(NO_PENDING, 'added')
    p = withPending(p, 'added')
    p = withPending(p, 'changed')
    expect(p).toEqual({ added: 2, changed: 1 })
    expect(pendingLabelCount(p)).toBe(2)
    expect(hasPending(p)).toBe(true)
  })

  it('surfaces changes with no new photos too', () => {
    const p = withPending(NO_PENDING, 'changed')
    expect(hasPending(p)).toBe(true)
    expect(pendingLabelCount(p)).toBe(0)
  })

  it('does not mutate the previous value', () => {
    const p = withPending(NO_PENDING, 'added')
    expect(NO_PENDING).toEqual({ added: 0, changed: 0 })
    expect(p).not.toBe(NO_PENDING)
  })
})

describe('receiveEvent', () => {
  const atTop = { scrollY: 0, pagesLoaded: 1 }
  const scrolledDeep = { scrollY: 8000, pagesLoaded: 3 }

  it('refreshes straight away at the top of the first page', () => {
    expect(receiveEvent(NO_PENDING, updated('ready'), atTop)).toEqual({
      refreshNow: true,
      pending: NO_PENDING,
    })
  })

  it('never refreshes under a viewer who scrolled away — it only counts', () => {
    // 남이 사진 3장을 올리는 동안 깊이 스크롤 중. 목록을 갈아끼우는 대신 안내만 쌓인다.
    let d = receiveEvent(NO_PENDING, updated('ready'), scrolledDeep)
    expect(d.refreshNow).toBe(false)
    d = receiveEvent(d.pending, updated('ready'), scrolledDeep)
    d = receiveEvent(d.pending, updated('ready'), scrolledDeep)
    expect(d.refreshNow).toBe(false)
    expect(d.pending).toEqual({ added: 3, changed: 0 })
  })

  it('leaves an irrelevant event with no trace at all', () => {
    const pending = { added: 2, changed: 0 }
    const d = receiveEvent(pending, updated('processing'), scrolledDeep)
    expect(d).toEqual({ refreshNow: false, pending })
    expect(d.pending).toBe(pending)
  })

  it('drops the counter when it decides to refresh — the list is about to be fresh', () => {
    const d = receiveEvent({ added: 5, changed: 1 }, updated('ready'), atTop)
    expect(d.pending).toEqual(NO_PENDING)
  })
})
