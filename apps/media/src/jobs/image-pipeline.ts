import { computeBlurhash } from '@/domain/blurhash'
import { rgbToHex } from '@/domain/color'
import type { StorageAdapter } from '@bebe/storage'
import sharp from 'sharp'
import { type Trio, generateTrios } from './derivative-trios'

export type ProcessImageInput = {
  originalKey: string
  assetId: string
  /** 이미 읽은 원본 바이트(있으면 재사용해 중복 read 회피). 변환된 경우엔 넘기지 않는다. */
  buffer?: Buffer
}

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

export async function processImage(
  input: ProcessImageInput,
  storage: StorageAdapter,
): Promise<ProcessImageResult> {
  const buf = input.buffer ?? (await collect(await storage.read(input.originalKey)))
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
  const trios = await generateTrios({ buffer: buf, assetId: input.assetId, storage })

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
