import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { latestBackup } from './list'
import {
  type BackupManifest,
  type BackupType,
  bundleName,
  makeBackupId,
  manifestName,
} from './manifest'

// execFile(쉘 없이 실행, 인자 배열 → 인젝션 없음). exec 가 아님.
const runFile = promisify(execFile)

export type CreateBackupArgs = {
  type: BackupType
  includeSecret: boolean
  backupDir: string
  dataDir: string
  databaseUrl: string
  schemaMigrations: string[]
  /** includeSecret 일 때 번들에 넣을 평문 키. 보통 process.env.SECRET_KEY. */
  secretKey?: string | undefined
  /** 파생물(썸네일) 포함 여부. 기본 true(복구 즉시 완전). false 면 작아지지만 복구 후 재생성 필요. */
  includeDerivatives?: boolean
  now: Date
}

type DataScan = { files: string[]; bytes: number }

// 백업에서 항상 제외하는 최상위 디렉터리.
// - tus-tmp: 진행 중/잔여 업로드 청크(휘발성 임시). 백업에 들어갈 이유 없음.
// - derivatives: 원본에서 재생성 가능(includeDerivatives=false 일 때 제외 → 복구 시 재생성).
const ALWAYS_EXCLUDE = new Set(['tus-tmp'])

async function scanDataFiles(
  dataDir: string,
  sinceMs: number,
  includeDerivatives: boolean,
): Promise<DataScan> {
  const files: string[] = []
  let bytes = 0
  async function walk(rel: string): Promise<void> {
    const abs = path.join(dataDir, rel)
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(abs, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name
      // 최상위 제외 디렉터리 컷.
      if (!rel) {
        if (ALWAYS_EXCLUDE.has(e.name)) continue
        if (!includeDerivatives && e.name === 'derivatives') continue
      }
      if (e.isDirectory()) {
        await walk(childRel)
      } else if (e.isFile()) {
        const st = await fs.stat(path.join(dataDir, childRel)).catch(() => null)
        if (!st) continue
        // 증분: 부모 백업 이후 생성/변경된 파일만. 자산은 불변이라 mtime 으로 충분.
        if (sinceMs > 0 && st.mtimeMs <= sinceMs) continue
        files.push(childRel)
        bytes += st.size
      }
    }
  }
  await walk('')
  return { files, bytes }
}

export async function createBackup(
  args: CreateBackupArgs,
): Promise<{ manifest: BackupManifest; bundlePath: string; bundleBytes: number }> {
  await fs.mkdir(args.backupDir, { recursive: true })

  let parent: BackupManifest | null = null
  let type = args.type
  if (type === 'incr') {
    parent = await latestBackup(args.backupDir)
    if (!parent) type = 'full' // 베이스가 없으면 full 로 승격
  }

  const id = makeBackupId(type, args.now)
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'bebe-backup-'))
  const bundlePath = path.join(args.backupDir, bundleName(id))

  try {
    // 1. DB 덤프(항상 full, 두 스키마 포함). owner 롤 URL.
    await runFile('pg_dump', ['-Fc', '-f', path.join(work, 'db.dump'), args.databaseUrl], {
      maxBuffer: 1024 * 1024 * 64,
    })

    // 2. 스토리지 파일 스캔(incr 이면 부모 이후만). tus-tmp 는 항상 제외.
    const sinceMs = parent ? new Date(parent.createdAt).getTime() : 0
    const includeDerivatives = args.includeDerivatives ?? true
    const scan = await scanDataFiles(args.dataDir, sinceMs, includeDerivatives)

    // 3. 매니페스트.
    const manifest: BackupManifest = {
      version: 1,
      id,
      createdAt: args.now.toISOString(),
      type,
      parentId: parent?.id ?? null,
      schemaMigrations: args.schemaMigrations,
      includesSecret: args.includeSecret && Boolean(args.secretKey),
      includesDerivatives: includeDerivatives,
      dataFileCount: scan.files.length,
      dataBytes: scan.bytes,
    }
    await fs.writeFile(path.join(work, 'manifest.json'), JSON.stringify(manifest, null, 2))

    // 4. (선택) 시크릿 키.
    const workMembers = ['db.dump', 'manifest.json']
    if (manifest.includesSecret && args.secretKey) {
      await fs.writeFile(path.join(work, 'secret.key'), args.secretKey, { mode: 0o600 })
      workMembers.push('secret.key')
    }

    // 5. 번들 = tar(work 메타파일 + data/ 접두 데이터파일) → zstd.
    const rawTar = path.join(work, 'bundle.tar')
    await runFile('tar', ['-cf', rawTar, '-C', work, ...workMembers])
    if (scan.files.length > 0) {
      const listFile = path.join(work, 'data-files.txt')
      await fs.writeFile(listFile, `${scan.files.join('\n')}\n`)
      await runFile('tar', [
        '-rf',
        rawTar,
        '-C',
        args.dataDir,
        '--transform',
        's,^,data/,',
        '-T',
        listFile,
      ])
    }
    // 사진·영상은 이미 압축돼 있어 높은 레벨은 CPU 만 쓴다 — 빠른 레벨(3) + long-range.
    await runFile('zstd', ['-q', '-f', '-3', '--long=27', rawTar, '-o', bundlePath], {
      maxBuffer: 1024 * 1024 * 16,
    })

    // 6. 사이드카 매니페스트(목록·부모탐색을 압축 풀지 않고 빠르게).
    await fs.writeFile(
      path.join(args.backupDir, manifestName(id)),
      JSON.stringify(manifest, null, 2),
    )

    const bundleBytes = (await fs.stat(bundlePath)).size
    return { manifest, bundlePath, bundleBytes }
  } finally {
    await fs.rm(work, { recursive: true, force: true })
  }
}
