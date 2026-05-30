import { describe, expect, it } from 'vitest'
import { stripJpegExif } from './download'

function seg(marker: number, body: Buffer): Buffer {
  const len = Buffer.alloc(2)
  len.writeUInt16BE(body.length + 2)
  return Buffer.concat([Buffer.from([0xff, marker]), len, body])
}

describe('stripJpegExif', () => {
  it('removes the EXIF APP1 segment but keeps everything else', () => {
    const soi = Buffer.from([0xff, 0xd8])
    const app0 = seg(0xe0, Buffer.concat([Buffer.from('JFIF\0'), Buffer.from([1, 1])]))
    const exif = seg(0xe1, Buffer.concat([Buffer.from('Exif\0\0'), Buffer.from([0xde, 0xad, 0xbe, 0xef])]))
    const sosAndData = Buffer.from([0xff, 0xda, 0x00, 0x03, 0x01, 0x11, 0x22, 0x33, 0xff, 0xd9])
    const jpeg = Buffer.concat([soi, app0, exif, sosAndData])

    const out = stripJpegExif(jpeg)
    expect(out.includes(Buffer.from('Exif\0\0'))).toBe(false)
    expect(out.includes(Buffer.from('JFIF\0'))).toBe(true)
    // SOS + 압축 데이터는 그대로
    expect(out.subarray(-sosAndData.length).equals(sosAndData)).toBe(true)
    expect(out.length).toBe(jpeg.length - exif.length)
  })

  it('returns non-JPEG buffers unchanged', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
    expect(stripJpegExif(png).equals(png)).toBe(true)
  })

  it('returns a JPEG without EXIF unchanged in content', () => {
    const soi = Buffer.from([0xff, 0xd8])
    const app0 = seg(0xe0, Buffer.from('JFIF\0'))
    const sos = Buffer.from([0xff, 0xda, 0x00, 0x02, 0xff, 0xd9])
    const jpeg = Buffer.concat([soi, app0, sos])
    expect(stripJpegExif(jpeg).equals(jpeg)).toBe(true)
  })
})
