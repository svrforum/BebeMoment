import type { StorageAdapter } from '@bebe/storage'
import sharp from 'sharp'
import { computeBlurhash } from '@/domain/blurhash'

type SizeKey = 'thumb256' | 'thumb512' | 'display1080'
type FormatKey = 'avif' | 'webp' | 'jpeg'

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

export type ProcessImageInput = {
  originalKey: string
  assetId: string
}

type Trio = { avif: string; webp: string; jpeg: string }

export type ProcessImageResult = {
  width: number | undefined
  height: number | undefined
  aspectRatio: number | null
  blurhash: string | null
  dominantColor: string | null
  derivatives: {
    v: 2
    thumb256: Trio
    thumb512: Trio
    display1080: Trio
  }
}

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(c as Buffer)
  return Buffer.concat(chunks)
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number): string =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

async function encodeFormat(buf: Buffer, max: number, format: FormatKey): Promise<Buffer> {
  const base = sharp(buf, { failOn: 'none' })
    .rotate()
    .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
  if (format === 'avif') return base.avif({ quality: QUALITY.avif }).toBuffer()
  if (format === 'webp') return base.webp({ quality: QUALITY.webp }).toBuffer()
  return base.jpeg({ quality: QUALITY.jpeg, progressive: true }).toBuffer()
}

export async function processImage(
  input: ProcessImageInput,
  storage: StorageAdapter,
): Promise<ProcessImageResult> {
  const buf = await collect(await storage.read(input.originalKey))
  const meta = await sharp(buf, { failOn: 'none' }).metadata()

  let dominantColor: string | null = null
  try {
    const stats = await sharp(buf, { failOn: 'none' }).stats()
    if (stats.channels.length >= 3) {
      const [r, g, b] = stats.channels
      dominantColor = rgbToHex(r?.mean ?? 0, g?.mean ?? 0, b?.mean ?? 0)
    }
  } catch {
    // dominant color is best-effort
  }

  const blurhash = await computeBlurhash(buf)

  const includeAvif = process.env.MEDIA_DERIVATIVES_INCLUDE_AVIF !== 'false'
  const formatsToGenerate: FormatKey[] = includeAvif ? ['avif', 'webp', 'jpeg'] : ['webp', 'jpeg']

  const sizeKeys = Object.keys(SIZES) as SizeKey[]
  const trios: Record<SizeKey, Trio> = {
    thumb256: { avif: '', webp: '', jpeg: '' },
    thumb512: { avif: '', webp: '', jpeg: '' },
    display1080: { avif: '', webp: '', jpeg: '' },
  }

  for (const sizeKey of sizeKeys) {
    const max = SIZES[sizeKey]
    for (const format of formatsToGenerate) {
      const out = await encodeFormat(buf, max, format)
      const key = `derivatives/${input.assetId}/${sizeKey}.${format}`
      await storage.writeBuffer(key, out, CONTENT_TYPE[format])
      trios[sizeKey][format] = key
    }
    if (!includeAvif) {
      trios[sizeKey].avif = trios[sizeKey].webp
    }
  }

  const aspectRatio =
    meta.width && meta.height && meta.width > 0 && meta.height > 0
      ? Number((meta.width / meta.height).toFixed(4))
      : null

  return {
    width: meta.width,
    height: meta.height,
    aspectRatio,
    blurhash,
    dominantColor,
    derivatives: {
      v: 2,
      thumb256: trios.thumb256,
      thumb512: trios.thumb512,
      display1080: trios.display1080,
    },
  }
}
