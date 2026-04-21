import { describe, expect, it } from 'vitest'
import { isImage, isVideo, kindOf, needsConvert } from './mime'

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
