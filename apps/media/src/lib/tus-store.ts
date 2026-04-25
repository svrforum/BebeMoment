import fs from 'node:fs'
import path from 'node:path'
import { parseEnv } from '@bebe/config'
import { FileStore } from '@tus/file-store'

let _store: FileStore | null = null

export function getTusStore(): FileStore {
  if (_store) return _store
  const env = parseEnv(process.env as Record<string, string | undefined>)
  const tmpDir = path.join(env.STORAGE_PATH, 'tus-tmp')
  fs.mkdirSync(tmpDir, { recursive: true })
  _store = new FileStore({ directory: tmpDir })
  return _store
}
