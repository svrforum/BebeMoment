import { encode } from 'blurhash'
import { decodeSharp } from '@/lib/sharp'

/**
 * Encode a blurhash from any image buffer.
 * Returns null on decode failure (corrupt input). Uses 4×3 components
 * which gives ~28 char string — fast to compute, small to store.
 */
export async function computeBlurhash(input: Buffer): Promise<string | null> {
  try {
    const { data, info } = await decodeSharp(input)
      // .rotate() 로 EXIF Orientation 을 픽셀에 반영 — 안 하면 세로 사진의 blurhash
      // placeholder 가 최종(자동회전된) 파생물 대비 90° 돌아간 채 표시된다.
      .rotate()
      .raw()
      .ensureAlpha()
      .resize(64, 64, { fit: 'inside' })
      .toBuffer({ resolveWithObject: true })
    return encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3)
  } catch {
    return null
  }
}
