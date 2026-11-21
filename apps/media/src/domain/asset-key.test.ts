import { describe, expect, it } from 'vitest'
import {
  imageDerivativeName,
  isImageDerivativeName,
  keyBelongsToAsset,
  keyOwnerId,
} from './asset-key'

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

const UUID = '33333333-3333-4333-8333-333333333333'
const OTHER_UUID = '44444444-4444-4444-8444-444444444444'

describe('isImageDerivativeName', () => {
  it.each(
    ['thumb256', 'thumb512', 'display1080'].flatMap((size) =>
      ['avif', 'webp', 'jpeg'].map((format) => `${size}.${format}`),
    ),
  )('accepts %s', (name) => {
    expect(isImageDerivativeName(name)).toBe(true)
  })

  it('accepts the video poster', () => {
    expect(isImageDerivativeName('poster.jpg')).toBe(true)
  })

  // 이름은 서명에 들어가지 않는다 — 이 목록이 저장소 키로 가는 유일한 관문이다.
  it.each([
    ['the playable video', 'preview.mp4'],
    ['an original', 'original'],
    ['an original with an extension', 'original.jpg'],
    ['an unknown format', 'thumb256.png'],
    ['an unknown size', 'thumb1024.webp'],
    ['poster in another format', 'poster.jpeg'],
    ['upper case', 'THUMB256.AVIF'],
    ['a parent path', '../thumb256.avif'],
    ['a nested path', 'x/thumb256.avif'],
    ['a trailing path', 'thumb256.avif/..'],
    ['an encoded slash', '..%2fthumb256.avif'],
    ['a NUL byte', 'thumb256.avif\0.jpg'],
    ['a trailing newline', 'thumb256.avif\n'],
    ['a leading space', ' thumb256.avif'],
    ['empty', ''],
  ])('rejects %s', (_label, name) => {
    expect(isImageDerivativeName(name)).toBe(false)
  })
})

describe('imageDerivativeName', () => {
  it('names an image derivative of that asset', () => {
    expect(imageDerivativeName(`derivatives/${UUID}/thumb256.webp`, UUID)).toBe('thumb256.webp')
    expect(imageDerivativeName(`derivatives/${UUID}/poster.jpg`, UUID)).toBe('poster.jpg')
  })

  it('is null for a derivative that belongs to another asset', () => {
    // 중복 자산 행은 원본 자산의 파생물 키를 가리킨다 — 그 키에 이 자산의 토큰을 내주지 않는다.
    expect(imageDerivativeName(`derivatives/${OTHER_UUID}/thumb256.webp`, UUID)).toBeNull()
  })

  it('is null for anything that is not an image derivative', () => {
    expect(imageDerivativeName(`derivatives/${UUID}/preview.mp4`, UUID)).toBeNull()
    expect(imageDerivativeName(`families/fam/assets/${UUID}/original.jpg`, UUID)).toBeNull()
    expect(imageDerivativeName(`derivatives/${UUID}/x/thumb256.webp`, UUID)).toBeNull()
    expect(imageDerivativeName(`x/derivatives/${UUID}/thumb256.webp`, UUID)).toBeNull()
  })
})

describe('keyOwnerId', () => {
  it('is the asset itself for an ordinary row', () => {
    expect(keyOwnerId({ id: UUID, duplicateOf: null })).toBe(UUID)
  })

  it('is the aliased asset for a duplicate upload — its keys live under that id', () => {
    const owner = keyOwnerId({ id: UUID, duplicateOf: OTHER_UUID })
    expect(owner).toBe(OTHER_UUID)
    expect(keyBelongsToAsset(`derivatives/${OTHER_UUID}/thumb256.webp`, 'fam', owner)).toBe(true)
    expect(imageDerivativeName(`derivatives/${OTHER_UUID}/thumb256.webp`, owner)).toBe(
      'thumb256.webp',
    )
  })
})
