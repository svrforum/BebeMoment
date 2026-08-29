import { describe, expect, it } from 'vitest'
import { isBroadlyPlayableVideo } from './video-compat'

describe('isBroadlyPlayableVideo', () => {
  it('폰으로 찍은 영상은 원본 그대로 내려도 된다', () => {
    // 안드로이드 기본 카메라 — H.264 8비트 4:2:0.
    expect(isBroadlyPlayableVideo('h264', 'yuv420p')).toBe(true)
    // 아이폰 기본 카메라 — HEVC 8비트 4:2:0. 요즘 갤러리는 전부 재생한다.
    expect(isBroadlyPlayableVideo('hevc', 'yuv420p')).toBe(true)
    // 풀레인지 JPEG 색범위 변형도 같은 4:2:0 8비트다.
    expect(isBroadlyPlayableVideo('h264', 'yuvj420p')).toBe(true)
  })

  it('4:2:2 · 10비트 촬영본은 폰 디코더가 영상 트랙을 못 푼다', () => {
    // A6700 XAVC — 오디오만 나오고 화면이 검게 나오던 조합.
    expect(isBroadlyPlayableVideo('hevc', 'yuv422p10le')).toBe(false)
    expect(isBroadlyPlayableVideo('h264', 'yuv422p')).toBe(false)
    expect(isBroadlyPlayableVideo('hevc', 'yuv420p10le')).toBe(false)
    expect(isBroadlyPlayableVideo('h264', 'yuv444p')).toBe(false)
  })

  it('편집·방송용 코덱은 코덱만으로 거른다', () => {
    expect(isBroadlyPlayableVideo('prores', 'yuv422p10le')).toBe(false)
    expect(isBroadlyPlayableVideo('dnxhd', 'yuv422p')).toBe(false)
    expect(isBroadlyPlayableVideo('mpeg2video', 'yuv420p')).toBe(false)
    expect(isBroadlyPlayableVideo('av1', 'yuv420p')).toBe(false)
    expect(isBroadlyPlayableVideo('vp9', 'yuv420p')).toBe(false)
  })

  it('모르면 재생 불가로 본다 — 호환본을 주는 쪽이 안전하다', () => {
    expect(isBroadlyPlayableVideo(undefined, 'yuv420p')).toBe(false)
    expect(isBroadlyPlayableVideo('h264', undefined)).toBe(false)
    expect(isBroadlyPlayableVideo(undefined, undefined)).toBe(false)
    expect(isBroadlyPlayableVideo('', '')).toBe(false)
  })

  it('대소문자 표기는 무시한다', () => {
    expect(isBroadlyPlayableVideo('H264', 'YUV420P')).toBe(true)
  })
})
