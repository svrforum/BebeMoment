import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import piexif from 'piexifjs'
import { describe, expect, it } from 'vitest'
import { reinjectExif } from './exif-reinject'

const b64 = readFileSync(join(__dirname, '__fixtures__/exif-sample-jpeg.base64.txt'), 'utf8').trim()
const originalDataUrl = `data:image/jpeg;base64,${b64}`

describe('reinjectExif', () => {
  it('preserves DateTimeOriginal and forces Orientation=1', () => {
    // "편집본" = EXIF 제거된 동일 JPEG
    const editedDataUrl = piexif.remove(originalDataUrl)
    // 편집본엔 EXIF 없음 확인
    const strippedExif = piexif.load(editedDataUrl)
    expect(strippedExif.Exif?.[piexif.ExifIFD.DateTimeOriginal]).toBeUndefined()

    const result = reinjectExif(originalDataUrl, editedDataUrl)
    const exif = piexif.load(result)
    expect(exif.Exif?.[piexif.ExifIFD.DateTimeOriginal]).toBe('2024:01:02 03:04:05')
    expect(exif['0th']?.[piexif.ImageIFD.Orientation]).toBe(1)
  })

  it('returns edited unchanged when original has no EXIF', () => {
    const noExif = piexif.remove(originalDataUrl)
    const result = reinjectExif(noExif, noExif)
    // EXIF 없으니 그대로(roundtrip 안전) — DateTimeOriginal 없음
    const exif = piexif.load(result)
    expect(exif.Exif?.[piexif.ExifIFD.DateTimeOriginal]).toBeUndefined()
  })
})
