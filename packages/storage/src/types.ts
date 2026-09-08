import { z } from 'zod'

export const StorageConfig = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('local'),
    path: z.string(),
  }),
  z.object({
    mode: z.literal('s3'),
    endpoint: z.string().url(),
    bucket: z.string(),
    accessKey: z.string(),
    secretKey: z.string(),
    region: z.string().default('us-east-1'),
    forcePathStyle: z.boolean().default(true),
  }),
])
export type StorageConfig = z.infer<typeof StorageConfig>

export type WriteResult = {
  key: string
  size: number
}

export type StorageStat = {
  size: number
  /** 마지막 수정 시각(ms). 백엔드가 안 주면 null. */
  mtimeMs: number | null
}

export interface StorageAdapter {
  write(key: string, stream: NodeJS.ReadableStream): Promise<WriteResult>
  writeBuffer(key: string, data: Buffer, mimeType?: string): Promise<WriteResult>
  read(key: string): Promise<NodeJS.ReadableStream>
  readRange(key: string, start: number, end: number): Promise<NodeJS.ReadableStream>
  /** 없으면 null — exists + size 를 한 번의 stat/HEAD 로. */
  stat(key: string): Promise<StorageStat | null>
  exists(key: string): Promise<boolean>
  delete(key: string): Promise<void>
  publicUrl(key: string, opts?: { expiresIn?: number }): Promise<string>
  size(key: string): Promise<number>
  /** 로컬 파일시스템 경로. ffmpeg 등 외부 도구가 제자리에서 읽고 쓸 수 있게 — 원격 백엔드는 null. */
  localPath(key: string): string | null
}
