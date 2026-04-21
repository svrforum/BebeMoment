const LOCK_KEYS: Record<string, string | undefined> = {
  'storage.mode': process.env.STORAGE_MODE,
  'storage.path': process.env.STORAGE_PATH,
  'storage.s3.endpoint': process.env.STORAGE_S3_ENDPOINT,
}

export function isLockedByEnv(key: string): boolean {
  return !!LOCK_KEYS[key]
}
