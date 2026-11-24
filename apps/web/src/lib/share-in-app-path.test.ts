import { describe, expect, it } from 'vitest'
import { shareInAppPath } from './share-in-app-path'

// 공유 화면의 '전체 보기' 버튼과, 가족으로 로그인한 사람을 보내는 곳이 같은 화면이어야 한다.
describe('shareInAppPath', () => {
  it('opens a story on its own page', () => {
    expect(shareInAppPath({ kind: 'story', publicNo: 67 })).toBe('/story/67')
  })

  it('opens an album on its own page', () => {
    expect(shareInAppPath({ kind: 'album', albumId: 'a1' })).toBe('/albums/a1')
  })

  it('opens a day and a memory on that day of the timeline', () => {
    expect(shareInAppPath({ kind: 'day', date: '2026-09-24' })).toBe('/timeline?date=2026-09-24')
    expect(shareInAppPath({ kind: 'memory', date: '2026-09-24' })).toBe('/timeline?date=2026-09-24')
  })
})
