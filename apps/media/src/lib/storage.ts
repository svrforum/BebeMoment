import { parseEnv } from '@bebe/config'
import { type StorageAdapter, createAdapter } from '@bebe/storage'

export function getStorage(): StorageAdapter {
  const env = parseEnv(process.env as Record<string, string | undefined>)
  if (env.STORAGE_MODE === 's3') {
    if (
      !env.STORAGE_S3_ENDPOINT ||
      !env.STORAGE_S3_BUCKET ||
      !env.STORAGE_S3_ACCESS_KEY ||
      !env.STORAGE_S3_SECRET_KEY
    ) {
      throw new Error('STORAGE_MODE=s3 requires all STORAGE_S3_* env vars')
    }
    return createAdapter({
      mode: 's3',
      endpoint: env.STORAGE_S3_ENDPOINT,
      bucket: env.STORAGE_S3_BUCKET,
      accessKey: env.STORAGE_S3_ACCESS_KEY,
      secretKey: env.STORAGE_S3_SECRET_KEY,
      region: env.STORAGE_S3_REGION,
      forcePathStyle: true,
    })
  }
  return createAdapter({ mode: 'local', path: env.STORAGE_PATH })
}
