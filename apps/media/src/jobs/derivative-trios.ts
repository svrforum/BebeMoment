import type { StorageAdapter } from '@bebe/storage'
import type sharp from 'sharp'
import { decodeSharp } from '@/lib/sharp'

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

/**
 * 한 자산이 생성할 수 있는 모든 파생물 키(결정적). 처리 실패 시 부분 생성된
 * 파생물을 정리할 때 쓴다 — 실패한 자산의 derivatives 필드는 DB 에 커밋되지
 * 않아 purge 의 collectKeys 가 못 찾으므로, 키를 직접 enumerate 한다.
 */
export function derivativeKeysFor(assetId: string): string[] {
  const sizes: SizeKey[] = ['thumb256', 'thumb512', 'display1080']
  const formats: FormatKey[] = ['avif', 'webp', 'jpeg']
  const keys = sizes.flatMap((s) => formats.map((f) => `derivatives/${assetId}/${s}.${f}`))
  keys.push(`derivatives/${assetId}/poster.jpg`, `derivatives/${assetId}/preview.mp4`)
  return keys
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

// base.clone() 으로 입력 디코드를 모든 (size,format) 출력이 공유한다 — 과거엔
// 9개 인코드가 각각 sharp(buf) 로 원본을 따로 디코드해, 고화소 이미지를
// concurrency 만큼 곱해 들고 있다가 저사양 ARM NAS 에서 OOM 났다. clone 은
// libvips 입력을 한 번만 디코드하고 파이프라인만 분기한다(sharp 공식 권장 패턴).
function encodeFromBase(base: sharp.Sharp, max: number, format: FormatKey): Promise<Buffer> {
  const pipe = base
    .clone()
    .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
  if (format === 'avif') return pipe.avif({ quality: QUALITY.avif }).toBuffer()
  if (format === 'webp') return pipe.webp({ quality: QUALITY.webp }).toBuffer()
  return pipe.jpeg({ quality: QUALITY.jpeg, progressive: true }).toBuffer()
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

  // Decode the source once; every (size, format) output clones this pipeline.
  // Sharp releases the GIL via libvips so concurrent encodes still parallelize.
  const base = decodeSharp(buffer).rotate()
  await Promise.all(
    sizeKeys.flatMap((sizeKey) =>
      formatsToGenerate.map(async (format) => {
        const out = await encodeFromBase(base, SIZES[sizeKey], format)
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
