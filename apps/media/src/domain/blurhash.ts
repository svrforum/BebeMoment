import sharp from 'sharp'
import { encode } from 'blurhash'

/**
 * Encode a blurhash from any image buffer.
 * Returns null on decode failure (corrupt input). Uses 4×3 components
 * which gives ~28 char string — fast to compute, small to store.
 */
export async function computeBlurhash(input: Buffer): Promise<string | null> {
  try {
    const { data, info } = await sharp(input, { failOn: 'none' })
      .raw()
      .ensureAlpha()
      .resize(64, 64, { fit: 'inside' })
      .toBuffer({ resolveWithObject: true })
    return encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3)
  } catch {
    return null
  }
}
