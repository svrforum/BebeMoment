import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { type TestDb, startTestDb } from '@bebe/db-public/src/test-db'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { BUNDLE_SPACE_MARGIN_BYTES, createBackup } from './create'

const runFile = promisify(execFile)

let db: TestDb
let root: string
let dataDir: string
let backupDir: string

beforeAll(async () => {
  db = await startTestDb()
}, 180_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'bebe-backup-test-'))
  dataDir = path.join(root, 'data')
  backupDir = path.join(root, 'backups')
  await fs.mkdir(path.join(dataDir, 'families', 'f1'), { recursive: true })
  await fs.mkdir(path.join(dataDir, 'tus-tmp'), { recursive: true })
  await fs.writeFile(path.join(dataDir, 'families', 'f1', 'big.jpg'), Buffer.alloc(5 * 1024 * 1024))
  await fs.writeFile(path.join(dataDir, 'tus-tmp', 'chunk'), 'volatile')
})
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

function baseArgs(type: 'full' | 'incr', now: Date) {
  return {
    type,
    includeSecret: false,
    backupDir,
    dataDir,
    databaseUrl: db.url,
    schemaMigrations: [] as string[],
    now,
  }
}

async function listMembers(bundle: string): Promise<string[]> {
  const tar = path.join(root, 'listing.tar')
  await runFile('zstd', ['-d', '-q', '-f', '--long=27', bundle, '-o', tar])
  const { stdout } = await runFile('tar', ['-tf', tar])
  return stdout.split('\n').filter(Boolean)
}

async function filesUnder(dir: string): Promise<string[]> {
  const out: string[] = []
  async function walk(rel: string): Promise<void> {
    let entries: import('node:fs').Dirent[] = []
    try {
      entries = await fs.readdir(path.join(dir, rel), { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) await walk(childRel)
      else out.push(childRel)
    }
  }
  await walk('')
  return out
}

describe('createBackup', () => {
  it('streams tar into zstd — no raw tar touches the disk, work dir is cleaned', async () => {
    const { manifest, bundlePath } = await createBackup(baseArgs('full', new Date()))
    const members = await listMembers(bundlePath)
    expect(members).toContain('manifest.json')
    expect(members).toContain('db.dump')
    expect(members).toContain('data/families/f1/big.jpg')
    expect(members.some((m) => m.includes('tus-tmp'))).toBe(false)
    expect(manifest.dataFileCount).toBe(1)

    const left = await filesUnder(backupDir)
    expect(left.sort()).toEqual([`${manifest.id}.manifest.json`, `${manifest.id}.tar.zst`].sort())
    expect(left.some((f) => f.endsWith('.tar'))).toBe(false)
  })

  // 예전엔 증분이어도 데이터 디렉터리 전체 크기로 여유를 요구했다 — 증분에 실제로 들어가는
  // 바이트(scan.bytes)로 재야 5GB 라이브러리에 사진 한 장 얹는 증분이 507 로 막히지 않는다.
  it('sizes the incremental preflight on the scanned bytes, not the whole data dir', async () => {
    // 원본은 부모 백업보다 확실히 오래된 파일이어야 증분 스캔(부모 시각 - 5분 슬랙)에서 빠진다.
    const old = new Date(Date.now() - 60 * 60 * 1000)
    await fs.utimes(path.join(dataDir, 'families', 'f1', 'big.jpg'), old, old)
    await createBackup(baseArgs('full', new Date()))
    await fs.writeFile(path.join(dataDir, 'families', 'f1', 'new.jpg'), Buffer.alloc(10))

    // 여유 = 마진 + 1MB: 새 파일 10B + DB 덤프(수십 KB)는 들어가고, 5MB 원본 전체는 안 들어간다.
    const { manifest } = await createBackup({
      ...baseArgs('incr', new Date()),
      freeBytesProbe: async () => BUNDLE_SPACE_MARGIN_BYTES + 1024n * 1024n,
    })
    expect(manifest.type).toBe('incr')
    expect(manifest.dataFileCount).toBe(1)
    expect(manifest.dataBytes).toBe(10)
  })

  it('refuses when the backup volume cannot hold the bundle and leaves nothing behind', async () => {
    await expect(
      createBackup({
        ...baseArgs('full', new Date()),
        freeBytesProbe: async () => BUNDLE_SPACE_MARGIN_BYTES,
      }),
    ).rejects.toThrow('backup.insufficientSpace')
    expect(await filesUnder(backupDir)).toEqual([])
  })
})
