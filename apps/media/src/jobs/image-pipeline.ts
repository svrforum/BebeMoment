import type { StorageAdapter } from '@bebe/storage'
import sharp from 'sharp'

type SizeKey = 'thumb_sm' | 'thumb_md' | 'thumb_lg'

const SIZES: Record<SizeKey, number> = {
  thumb_sm: 320,
  thumb_md: 720,
  thumb_lg: 1600,
}

export type ProcessImageInput = {
  originalKey: string
  assetId: string
}

export type ProcessImageResult = {
  width: number | undefined
  height: number | undefined
  derivatives: Record<SizeKey, string>
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
  const buf = await collect(await storage.read(input.originalKey))
  const meta = await sharp(buf, { failOn: 'none' }).metadata()

  const derivatives = {} as Record<SizeKey, string>
  for (const [name, max] of Object.entries(SIZES) as [SizeKey, number][]) {
    const out = await sharp(buf, { failOn: 'none' })
      .rotate()
      .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer()
    const key = `derivatives/${input.assetId}/${name}.webp`
    await storage.writeBuffer(key, out, 'image/webp')
    derivatives[name] = key
  }

  return {
    width: meta.width,
    height: meta.height,
    derivatives,
  }
}
