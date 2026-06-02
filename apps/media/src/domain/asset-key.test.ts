import { describe, expect, it } from 'vitest'
import { keyBelongsToAsset } from './asset-key'

const FAM = 'fam-1'
const A = 'asset-1'

describe('keyBelongsToAsset', () => {
  it('accepts original/converted keys under families/<fam>/assets/<asset>/', () => {
    expect(keyBelongsToAsset(`families/${FAM}/assets/${A}/original`, FAM, A)).toBe(true)
    expect(keyBelongsToAsset(`families/${FAM}/assets/${A}/original.converted.jpg`, FAM, A)).toBe(
      true,
    )
  })

  it('accepts derivative keys under derivatives/<asset>/ (no familyId in key)', () => {
    // 회귀 가드: 썸네일·표시·포스터·프리뷰가 401 나면 모든 사진이 안 뜬다.
    expect(keyBelongsToAsset(`derivatives/${A}/thumb256.webp`, FAM, A)).toBe(true)
    expect(keyBelongsToAsset(`derivatives/${A}/display1080.jpeg`, FAM, A)).toBe(true)
    expect(keyBelongsToAsset(`derivatives/${A}/poster.jpg`, FAM, A)).toBe(true)
    expect(keyBelongsToAsset(`derivatives/${A}/preview.mp4`, FAM, A)).toBe(true)
  })

  it('rejects another asset/family (IDOR)', () => {
    expect(keyBelongsToAsset(`families/other/assets/other/original`, FAM, A)).toBe(false)
    expect(keyBelongsToAsset(`derivatives/other-asset/thumb256.webp`, FAM, A)).toBe(false)
  })
})
