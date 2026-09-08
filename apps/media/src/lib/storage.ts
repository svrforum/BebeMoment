import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { type StorageAdapter, createAdapter } from '@bebe/storage'
import { getEnv } from './env'

export function getStorage(): StorageAdapter {
  const env = getEnv()
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

/** 파일 경로를 요구하는 외부 도구(ffprobe 등)용 — 로컬이면 제자리, 원격이면 임시 복사 후 정리. */
export async function withLocalFile<T>(
  storage: StorageAdapter,
  key: string,
  fn: (file: string) => Promise<T>,
): Promise<T> {
  const inPlace = storage.localPath(key)
  if (inPlace) return fn(inPlace)
  const work = await mkdtemp(path.join(tmpdir(), 'bebe-local-'))
  try {
    const file = path.join(work, 'input')
    await pipeline(await storage.read(key), createWriteStream(file))
    return await fn(file)
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}
