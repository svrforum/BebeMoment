import { needsConvert } from '@bebe/core'
import type { StorageAdapter } from '@bebe/storage'
import { decodeSharp } from '@/lib/sharp'

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
  const converted = await decodeSharp(buf).rotate().jpeg({ quality: 90 }).toBuffer()

  const newKey = `${input.originalKey}.converted.jpg`
  await storage.writeBuffer(newKey, converted, 'image/jpeg')
  // 원본은 여기서 지우지 않는다 — process-asset 이 파생물 생성·DB 커밋이 성공한
  // 뒤에 옛 원본을 지운다. 변환 후 파생 단계가 실패해도 재시도가 원본을 다시 읽을
  // 수 있어야 하기 때문(원본 영구 손실 방지).

  return {
    newKey,
    newMimeType: 'image/jpeg',
    newSizeBytes: BigInt(converted.length),
    originalMimeType: input.mimeType,
  }
}
