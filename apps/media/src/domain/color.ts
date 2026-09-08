import type { RawImage } from './raw-image'

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number): string =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/** 작은 미리보기 raw 의 RGB 평균 — 원본 전체를 다시 디코드하는 stats() 대신 쓴다. */
export function averageColor(raw: RawImage): string | null {
  const { channels } = raw.info
  if (channels !== 3 && channels !== 4) return null
  const pixels = Math.floor(raw.data.length / channels)
  if (pixels === 0) return null
  let r = 0
  let g = 0
  let b = 0
  for (let i = 0; i < pixels * channels; i += channels) {
    r += raw.data[i] ?? 0
    g += raw.data[i + 1] ?? 0
    b += raw.data[i + 2] ?? 0
  }
  return rgbToHex(r / pixels, g / pixels, b / pixels)
}
