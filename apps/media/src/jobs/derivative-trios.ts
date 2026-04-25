import type { StorageAdapter } from '@bebe/storage'
import sharp from 'sharp'

export type SizeKey = 'thumb256' | 'thumb512' | 'display1080'
export type FormatKey = 'avif' | 'webp' | 'jpeg'
export type Trio = { avif: string; webp: string; jpeg: string }

export type Trios = {
  thumb256: Trio
  thumb512: Trio
  display1080: Trio
}

const SIZES: Record<SizeKey, number> = {
  thumb256: 256,
  thumb512: 512,
  display1080: 1080,
}

const QUALITY: Record<FormatKey, number> = {
  avif: 50,
  webp: 80,
  jpeg: 82,
}

const CONTENT_TYPE: Record<FormatKey, string> = {
  avif: 'image/avif',
  webp: 'image/webp',
  jpeg: 'image/jpeg',
}

async function encodeFormat(buf: Buffer, max: number, format: FormatKey): Promise<Buffer> {
  const base = sharp(buf, { failOn: 'none' })
    .rotate()
    .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
  if (format === 'avif') return base.avif({ quality: QUALITY.avif }).toBuffer()
  if (format === 'webp') return base.webp({ quality: QUALITY.webp }).toBuffer()
  return base.jpeg({ quality: QUALITY.jpeg, progressive: true }).toBuffer()
}

/**
 * Generate the 3-tier image derivative grid from a single source buffer.
 * Used by the image pipeline (original) and the video pipeline (poster frame),
 * so the timeline grid can render a thumb regardless of asset kind.
 */
export async function generateTrios(args: {
  buffer: Buffer
  assetId: string
  storage: StorageAdapter
}): Promise<Trios> {
  const { buffer, assetId, storage } = args
  const includeAvif = process.env.MEDIA_DERIVATIVES_INCLUDE_AVIF !== 'false'
  const formatsToGenerate: FormatKey[] = includeAvif ? ['avif', 'webp', 'jpeg'] : ['webp', 'jpeg']

  const sizeKeys = Object.keys(SIZES) as SizeKey[]
  const trios: Trios = {
    thumb256: { avif: '', webp: '', jpeg: '' },
    thumb512: { avif: '', webp: '', jpeg: '' },
    display1080: { avif: '', webp: '', jpeg: '' },
  }

  // Encode all (size, format) pairs concurrently. Sharp releases the GIL via libvips
  // so this gives us real parallelism on multi-core hosts.
  await Promise.all(
    sizeKeys.flatMap((sizeKey) =>
      formatsToGenerate.map(async (format) => {
        const out = await encodeFormat(buffer, SIZES[sizeKey], format)
        const key = `derivatives/${assetId}/${sizeKey}.${format}`
        await storage.writeBuffer(key, out, CONTENT_TYPE[format])
        trios[sizeKey][format] = key
      }),
    ),
  )

  if (!includeAvif) {
    for (const sizeKey of sizeKeys) {
      trios[sizeKey].avif = trios[sizeKey].webp
    }
  }
  return trios
}
