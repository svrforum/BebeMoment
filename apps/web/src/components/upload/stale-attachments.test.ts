import { describe, expect, it } from 'vitest'
import { partitionStaleAttachments } from './stale-attachments'

describe('partitionStaleAttachments', () => {
  it('매니저에 남아 있는 첨부만 살린다', () => {
    const files = [{ id: 'a' }, { id: 'c' }]
    const r = partitionStaleAttachments(files, [{ fileId: 'a' }, { fileId: 'b' }, { fileId: 'c' }])
    expect(r.live.map((x) => x.fileId)).toEqual(['a', 'c'])
    expect(r.staleCount).toBe(1)
  })

  // 이게 막다른 길의 정체였다: 업로드가 끝나 자동정리가 파일을 치우면, 컴포저는 죽은
  // fileId 만 든 채로 남아 "올리기"를 눌러도 시작할 게 없어 같은 에러만 반복했다.
  it('매니저가 비었으면 전부 죽은 것으로 본다', () => {
    const r = partitionStaleAttachments([], [{ fileId: 'a' }, { fileId: 'b' }])
    expect(r.live).toEqual([])
    expect(r.staleCount).toBe(2)
  })

  it('전부 살아 있으면 그대로 두고 죽은 건 0', () => {
    const files = [{ id: 'a' }, { id: 'b' }]
    const r = partitionStaleAttachments(files, [{ fileId: 'a' }, { fileId: 'b' }])
    expect(r.live).toHaveLength(2)
    expect(r.staleCount).toBe(0)
  })

  it('첨부가 없으면 아무것도 안 한다', () => {
    expect(partitionStaleAttachments([{ id: 'a' }], [])).toEqual({ live: [], staleCount: 0 })
  })
})
