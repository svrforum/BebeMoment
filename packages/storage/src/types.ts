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

export interface StorageAdapter {
  write(key: string, stream: NodeJS.ReadableStream): Promise<WriteResult>
  writeBuffer(key: string, data: Buffer, mimeType?: string): Promise<WriteResult>
  read(key: string): Promise<NodeJS.ReadableStream>
  readRange(key: string, start: number, end: number): Promise<NodeJS.ReadableStream>
  exists(key: string): Promise<boolean>
  delete(key: string): Promise<void>
  publicUrl(key: string, opts?: { expiresIn?: number }): Promise<string>
  size(key: string): Promise<number>
}
