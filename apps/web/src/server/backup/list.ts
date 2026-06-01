import { promises as fs } from 'node:fs'
import path from 'node:path'
import { type BackupManifest, bundleName, manifestName } from './manifest'

export type BackupEntry = BackupManifest & { bundleBytes: number }

async function readManifest(dir: string, file: string): Promise<BackupManifest | null> {
  try {
    const raw = await fs.readFile(path.join(dir, file), 'utf8')
    const m = JSON.parse(raw) as BackupManifest
    if (m && m.version === 1 && typeof m.id === 'string') return m
    return null
  } catch {
    return null
  }
}

/** 백업 디렉터리의 모든 백업(사이드카 매니페스트 기준)을 최신순으로. */
export async function listBackups(dir: string): Promise<BackupEntry[]> {
  let files: string[] = []
  try {
    files = await fs.readdir(dir)
  } catch {
    return []
  }
  const manifests = files.filter((f) => f.endsWith('.manifest.json'))
  const out: BackupEntry[] = []
  for (const f of manifests) {
    const m = await readManifest(dir, f)
    if (!m) continue
    let bundleBytes = 0
    try {
      bundleBytes = (await fs.stat(path.join(dir, bundleName(m.id)))).size
    } catch {
      // bundle 없는 고아 매니페스트는 건너뜀
      continue
    }
    out.push({ ...m, bundleBytes })
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** incr 백업의 부모로 삼을 가장 최근 백업. 없으면 null(→ 호출자가 full 강제). */
export async function latestBackup(dir: string): Promise<BackupManifest | null> {
  const all = await listBackups(dir)
  return all[0] ?? null
}

export async function findBackup(dir: string, id: string): Promise<BackupManifest | null> {
  return readManifest(dir, manifestName(id))
}
