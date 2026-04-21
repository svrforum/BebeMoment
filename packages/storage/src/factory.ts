import { LocalAdapter } from './local'
import { S3Adapter } from './s3'
import { type StorageAdapter, StorageConfig } from './types'

export function createAdapter(cfg: StorageConfig): StorageAdapter {
  const parsed = StorageConfig.parse(cfg)
  if (parsed.mode === 'local') return new LocalAdapter(parsed)
  return new S3Adapter(parsed)
}
