import { needsConvert } from '@bebe/core'
import type { StorageAdapter } from '@bebe/storage'
import sharp from 'sharp'

export type ConvertResult = {
  newKey: string
  newMimeType: string
  newSizeBytes: bigint
  originalMimeType: string
} | null

export type ConvertInput = {
  originalKey: string
  mimeType: string
  assetId: string
}

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(c as Buffer)
  return Buffer.concat(chunks)
}

export async function convertImageIfNeeded(
  input: ConvertInput,
  storage: StorageAdapter,
): Promise<ConvertResult> {
  if (!needsConvert(input.mimeType) || !input.mimeType.startsWith('image/')) return null

  const buf = await collect(await storage.read(input.originalKey))
  const converted = await sharp(buf, { failOn: 'none' }).rotate().jpeg({ quality: 90 }).toBuffer()

  const newKey = `${input.originalKey}.converted.jpg`
  await storage.writeBuffer(newKey, converted, 'image/jpeg')
  await storage.delete(input.originalKey)

  return {
    newKey,
    newMimeType: 'image/jpeg',
    newSizeBytes: BigInt(converted.length),
    originalMimeType: input.mimeType,
  }
}
