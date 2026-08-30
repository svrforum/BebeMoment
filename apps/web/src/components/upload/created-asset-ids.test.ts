import { describe, expect, it } from 'vitest'
import { createdAssetIds } from './created-asset-ids'

describe('createdAssetIds', () => {
  it('서버에 만들어진 것(assetId 있는 것)만 고른다', () => {
    const files = [
      { id: 'f1', meta: { assetId: 'A1' } },
      { id: 'f2' },
      { id: 'f3', meta: { assetId: 'A3' } },
    ]
    expect(createdAssetIds(files, ['f1', 'f2', 'f3'])).toEqual(['A1', 'A3'])
  })

  it('순서 목록에 없는 파일은 건드리지 않는다 — 남의 배치를 되돌리면 안 된다', () => {
    const files = [
      { id: 'mine', meta: { assetId: 'MINE' } },
      { id: 'other', meta: { assetId: 'OTHER' } },
    ]
    expect(createdAssetIds(files, ['mine'])).toEqual(['MINE'])
  })

  // ⚠️ 이걸 놓쳐서 되돌리기가 통째로 아무것도 안 했다: 업로드를 먼저 중단하면 uppy 가
  // 파일 목록을 비워버려, 그 뒤에 목록에서 assetId 를 읽으면 언제나 빈 배열이었다.
  // 스냅샷은 중단보다 먼저여야 한다.
  it('파일 목록이 이미 비었으면 아무것도 못 고른다 — 중단 전에 스냅샷해야 하는 이유', () => {
    expect(createdAssetIds([], ['f1', 'f2'])).toEqual([])
  })

  it('중복 id 는 한 번만 — 같은 자산을 두 번 지우려 하지 않는다', () => {
    const files = [
      { id: 'f1', meta: { assetId: 'A1' } },
      { id: 'f2', meta: { assetId: 'A1' } },
    ]
    expect(createdAssetIds(files, ['f1', 'f2'])).toEqual(['A1'])
  })
})
