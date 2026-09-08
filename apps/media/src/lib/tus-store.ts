import fs from 'node:fs'
import path from 'node:path'
import { FileStore } from '@tus/file-store'
import { getEnv } from './env'

let _store: FileStore | null = null

/** 업로드 중 바이트가 쌓이는 곳 — 스토리지 모드와 무관하게 항상 로컬 디스크다. */
export function tusTmpDir(): string {
  return path.join(getEnv().STORAGE_PATH, 'tus-tmp')
}

export function getTusStore(): FileStore {
  if (_store) return _store
  const tmpDir = tusTmpDir()
  fs.mkdirSync(tmpDir, { recursive: true })
  _store = new FileStore({ directory: tmpDir })
  return _store
}
