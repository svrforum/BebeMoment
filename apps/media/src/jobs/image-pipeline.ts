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
  // EXIF Orientation 5-8(세로 촬영) 사진은 sharp metadata 의 width/height 가 회전 전
  // raw 치수다. 파생물은 .rotate() 로 자동회전되므로(derivative-trios), 표시 비율과
  // 맞추려면 회전 보정된 치수(autoOrient)를 써야 한다. 안 그러면 가로/세로가 전치된
  // 치수·aspectRatio 가 DB 에 영구 저장돼 레이아웃 reservation 이 틀어진다.
  const orientedWidth = meta.autoOrient?.width ?? meta.width
  const orientedHeight = meta.autoOrient?.height ?? meta.height

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
    orientedWidth && orientedHeight && orientedWidth > 0 && orientedHeight > 0
      ? Number((orientedWidth / orientedHeight).toFixed(4))
      : null

  return {
    width: orientedWidth,
    height: orientedHeight,
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
