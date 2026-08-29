import { describe, expect, it } from 'vitest'
import { isImage, isVideo, kindOf, needsConvert, mimeForFile } from './mime'

describe('mime helpers', () => {
  it('classifies images', () => {
    expect(isImage('image/jpeg')).toBe(true)
    expect(isImage('image/heic')).toBe(true)
    expect(isImage('video/mp4')).toBe(false)
  })
  it('classifies videos', () => {
    expect(isVideo('video/mp4')).toBe(true)
    expect(isVideo('video/quicktime')).toBe(true)
    expect(isVideo('image/jpeg')).toBe(false)
  })
  it('kindOf returns image/video/null', () => {
    expect(kindOf('image/jpeg')).toBe('image')
    expect(kindOf('video/mp4')).toBe('video')
    expect(kindOf('application/pdf')).toBeNull()
  })
  it('needsConvert identifies HEIC/HEIF/AVIF/quicktime', () => {
    expect(needsConvert('image/heic')).toBe(true)
    expect(needsConvert('image/heif')).toBe(true)
    expect(needsConvert('image/avif')).toBe(true)
    expect(needsConvert('video/quicktime')).toBe(true)
    expect(needsConvert('image/jpeg')).toBe(false)
    expect(needsConvert('video/mp4')).toBe(false)
  })
})

describe('mimeForFile', () => {
  it('브라우저가 준 media MIME 을 그대로 믿는다', () => {
    expect(mimeForFile('a.jpg', 'image/jpeg')).toBe('image/jpeg')
    expect(mimeForFile('a.mp4', 'video/mp4')).toBe('video/mp4')
  })

  it('파일 선택기가 MIME 을 모를 때 확장자로 메운다', () => {
    // 삼성 갤러리가 색인하지 못하는 카메라 파일(A6700 XAVC 등)은 문서 선택기로
    // 골라야 하는데, 그 경로는 octet-stream 이나 빈 값을 준다.
    expect(mimeForFile('C0053.MP4', 'application/octet-stream')).toBe('video/mp4')
    expect(mimeForFile('C0053.MP4', '')).toBe('video/mp4')
    expect(mimeForFile('DSC01234.ARW', undefined)).toBe(null)
    expect(mimeForFile('clip.mov', 'application/octet-stream')).toBe('video/quicktime')
    expect(mimeForFile('img.HEIC', '')).toBe('image/heic')
  })

  it('미디어가 아닌 건 거부한다 — 아무 파일이나 올라가면 안 된다', () => {
    expect(mimeForFile('report.pdf', 'application/pdf')).toBe(null)
    expect(mimeForFile('archive.zip', 'application/octet-stream')).toBe(null)
    expect(mimeForFile('noext', '')).toBe(null)
  })
})
