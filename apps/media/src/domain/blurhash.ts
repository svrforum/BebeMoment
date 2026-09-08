import { encode } from 'blurhash'
import { decodeSharp } from '@/lib/sharp'
import type { RawImage } from './raw-image'

/** 파생물 파이프라인이 이미 뽑아 둔 RGBA 미리보기에서 인코드 — 원본 재디코드 없음. 4×3 컴포넌트. */
export function encodeBlurhash(raw: RawImage): string | null {
  if (raw.info.channels !== 4 || raw.data.length === 0) return null
  try {
    return encode(new Uint8ClampedArray(raw.data), raw.info.width, raw.info.height, 4, 3)
  } catch {
    return null
  }
}

/**
 * Encode a blurhash from any image buffer.
 * Returns null on decode failure (corrupt input).
 */
export async function computeBlurhash(input: Buffer): Promise<string | null> {
  try {
    const raw = await decodeSharp(input)
      // .rotate() 로 EXIF Orientation 을 픽셀에 반영 — 안 하면 세로 사진의 blurhash
      // placeholder 가 최종(자동회전된) 파생물 대비 90° 돌아간 채 표시된다.
      .rotate()
      .raw()
      .ensureAlpha()
      .resize(64, 64, { fit: 'inside' })
      .toBuffer({ resolveWithObject: true })
    return encodeBlurhash(raw)
  } catch {
    return null
  }
}
