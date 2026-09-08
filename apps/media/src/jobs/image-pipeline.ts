import { encodeBlurhash } from '@/domain/blurhash'
import { averageColor } from '@/domain/color'
import type { StorageAdapter } from '@bebe/storage'
import { decodeSharp } from '@/lib/sharp'
import { type Trio, generateTrios } from './derivative-trios'

export type ProcessImageInput = {
  originalKey: string
  assetId: string
  /** 이미 읽은(또는 변환된) 원본 바이트. 없으면 스토리지에서 읽는다. */
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
  // 헤더만 읽는다 — 픽셀 디코드는 아래 generateTrios 의 파이프라인 한 번뿐이다.
  const meta = await decodeSharp(buf).metadata()
  // EXIF Orientation 5-8(세로 촬영) 사진은 sharp metadata 의 width/height 가 회전 전
  // raw 치수다. 파생물은 .rotate() 로 자동회전되므로(derivative-trios), 표시 비율과
  // 맞추려면 회전 보정된 치수(autoOrient)를 써야 한다. 안 그러면 가로/세로가 전치된
  // 치수·aspectRatio 가 DB 에 영구 저장돼 레이아웃 reservation 이 틀어진다.
  const orientedWidth = meta.autoOrient?.width ?? meta.width
  const orientedHeight = meta.autoOrient?.height ?? meta.height

  const { trios, preview } = await generateTrios({ buffer: buf, assetId: input.assetId, storage })

  const aspectRatio =
    orientedWidth && orientedHeight && orientedWidth > 0 && orientedHeight > 0
      ? Number((orientedWidth / orientedHeight).toFixed(4))
      : null

  return {
    width: orientedWidth,
    height: orientedHeight,
    aspectRatio,
    blurhash: encodeBlurhash(preview),
    dominantColor: averageColor(preview),
    derivatives: {
      v: 2,
      thumb256: trios.thumb256,
      thumb512: trios.thumb512,
      display1080: trios.display1080,
    },
  }
}
