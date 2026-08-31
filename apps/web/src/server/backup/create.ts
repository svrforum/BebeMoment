import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import { statfs } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { latestBackup } from './list'
import { ServiceError } from '@/server/error'
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

/**
 * 임시 tar 를 담을 여유가 있는지 확인한다(업로드의 statfs 사전 확인과 같은 방식).
 * statfs 미지원 환경에서는 확인을 건너뛴다 — 없다고 백업을 막지는 않는다.
 */
async function assertRoomForBundle(dataDir: string): Promise<void> {
  try {
    const [dataSize, tmp] = await Promise.all([dirSize(dataDir), statfs(os.tmpdir())])
    const free = BigInt(tmp.bavail) * BigInt(tmp.bsize)
    // 비압축 tar + 여유 512MB.
    const needed = dataSize + 512n * 1024n * 1024n
    if (free < needed) {
      throw new ServiceError(507, `backup.insufficientSpace`)
    }
  } catch (e) {
    if (e instanceof ServiceError) throw e
    // statfs 실패는 무시(가용성 우선).
  }
}

/** 백업 대상 디렉터리의 총 바이트(tus-tmp 제외 — 번들에 안 들어간다). */
async function dirSize(dir: string): Promise<bigint> {
  let total = 0n
  const walk = async (d: string): Promise<void> => {
    let entries: { name: string; isDirectory(): boolean }[]
    try {
      entries = await fs.readdir(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name === 'tus-tmp') continue
      const full = path.join(d, e.name)
      if (e.isDirectory()) await walk(full)
      else {
        try {
          total += BigInt((await fs.stat(full)).size)
        } catch {
          // 스캔 중 사라진 파일은 무시.
        }
      }
    }
  }
  await walk(dir)
  return total
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
  // 임시 tar 는 압축 전 원본 크기 그대로 쌓인다 — 컨테이너 쓰기 레이어가 꽉 차면 백업이
  // 실패할 뿐 아니라 앱 전체가 디스크 부족에 빠진다. 업로드가 하는 것과 같은 사전 확인.
  // ⚠️ 백업은 STORAGE_PATH 를 파일시스템으로 직접 읽는다(@bebe/storage 어댑터 미사용).
  // s3 모드면 /data 가 비어 있어 사진이 한 장도 안 담긴다 — DB 만 든 번들이 만들어지고
  // 화면은 "사진+영상"이라고 말한다. 조용히 두지 않고 매니페스트에 남긴다(§10).
  const storageMode = process.env.STORAGE_MODE ?? 'local'
  await assertRoomForBundle(args.dataDir)
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'bebe-backup-'))
  const bundlePath = path.join(args.backupDir, bundleName(id))

  try {
    // 1. DB 덤프(항상 full, 두 스키마 포함). owner 롤 URL.
    await runFile('pg_dump', ['-Fc', '-f', path.join(work, 'db.dump'), args.databaseUrl], {
      maxBuffer: 1024 * 1024 * 64,
    })

    // 2. 스토리지 파일 스캔(incr 이면 부모 이후만). tus-tmp 는 항상 제외.
    // 부모의 createdAt 은 스캔/덤프 시작 전에 캡처된 순간이라, 부모 백업이 도는 동안
    // 올라온 사진이 부모(스캔이 이미 지나감)·자식(mtime ≤ 부모 createdAt) 양쪽에서
    // 누락될 수 있다. 경계를 슬랙만큼 앞당겨 그 창의 파일을 자식에 포함시킨다 — 중복
    // 포함은 자산 불변이라 무해(전개 시 동일 내용 덮어쓰기)하고, 누락이 훨씬 위험하다.
    const INCR_SLACK_MS = 5 * 60 * 1000
    const sinceMs = parent ? new Date(parent.createdAt).getTime() - INCR_SLACK_MS : 0
    const includeDerivatives = args.includeDerivatives ?? true
    const scan = await scanDataFiles(args.dataDir, sinceMs, includeDerivatives)

    // 3. 매니페스트.
    const manifest: BackupManifest = {
      version: 1,
      id,
      createdAt: args.now.toISOString(),
      type,
      parentId: parent?.id ?? null,
      storageMode,
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

    // 5b. 무결성 검증 — 손상/절단된 번들을 복구 시점이 아니라 지금 잡는다(zstd -t 는
    // 내장 체크섬까지 검증). 매니페스트는 검증 통과 후에만 써서, 깨진 번들이 목록·부모
    // 탐색에 healthy 로 보이지 않게.
    await runFile('zstd', ['-t', '--long=27', bundlePath])

    // 6. 사이드카 매니페스트(목록·부모탐색을 압축 풀지 않고 빠르게).
    await fs.writeFile(
      path.join(args.backupDir, manifestName(id)),
      JSON.stringify(manifest, null, 2),
    )

    const bundleBytes = (await fs.stat(bundlePath)).size
    return { manifest, bundlePath, bundleBytes }
  } catch (e) {
    // 중간 실패(ENOSPC·검증 실패 등) 시 절단된 번들을 남기지 않는다 — finally 는 work
    // 임시 디렉터리만 지우고 backupDir 의 bundlePath 는 안 지우므로 여기서 정리.
    await fs.rm(bundlePath, { force: true }).catch(() => {})
    throw e
  } finally {
    await fs.rm(work, { recursive: true, force: true })
  }
}
