import { execFile, spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
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

/** 번들 크기 위에 요구하는 여유. 사진·영상은 이미 압축돼 있어 번들 ≈ 담기는 바이트다. */
export const BUNDLE_SPACE_MARGIN_BYTES = 512n * 1024n * 1024n

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
  /** 백업 볼륨의 여유 바이트. 기본 statfs(backupDir); null 이면 확인을 건너뛴다(없다고 막지 않는다). */
  freeBytesProbe?: (dir: string) => Promise<bigint | null>
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

/** statfs 미지원 환경에서는 null — 확인을 건너뛴다(없다고 백업을 막지는 않는다). */
async function freeBytesOnVolume(dir: string): Promise<bigint | null> {
  try {
    const s = await statfs(dir)
    return BigInt(s.bavail) * BigInt(s.bsize)
  } catch {
    return null
  }
}

/**
 * tar 를 zstd 표준입력으로 흘려 번들을 바로 쓴다. 예전엔 비압축 tar 를 먼저 디스크에 만들었는데
 * 그 임시 파일이 컨테이너 /tmp(쓰기 레이어)에 원본 크기 그대로 쌓여 앱 전체를 디스크 부족에
 * 빠뜨릴 수 있었다. 지금은 원본 크기의 tar 가 어디에도 닿지 않는다.
 */
async function tarToZstd(work: string, listFile: string, bundlePath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tar = spawn('tar', ['-cf', '-', '-C', work, '-T', listFile], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const zstd = spawn('zstd', ['-q', '-f', '-3', '--long=27', '-o', bundlePath], {
      stdio: ['pipe', 'ignore', 'pipe'],
    })
    let tarErr = ''
    let zstdErr = ''
    tar.stderr.on('data', (d) => {
      tarErr += d
    })
    zstd.stderr.on('data', (d) => {
      zstdErr += d
    })
    // zstd 가 먼저 죽으면 tar 는 EPIPE 를 맞는다 — 그건 종료코드로 이미 실패로 잡힌다.
    tar.stdout.on('error', () => {})
    zstd.stdin.on('error', () => {})
    tar.stdout.pipe(zstd.stdin)

    let tarCode: number | null = null
    let zstdCode: number | null = null
    const settle = (): void => {
      if (tarCode === null || zstdCode === null) return
      if (tarCode === 0 && zstdCode === 0) resolve()
      else
        reject(
          new Error(
            `tar|zstd failed (tar ${tarCode}: ${tarErr.trim()} / zstd ${zstdCode}: ${zstdErr.trim()})`,
          ),
        )
    }
    tar.on('error', reject)
    zstd.on('error', reject)
    tar.on('close', (code) => {
      tarCode = code ?? 1
      settle()
    })
    zstd.on('close', (code) => {
      zstdCode = code ?? 1
      settle()
    })
  })
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
  // ⚠️ 백업은 STORAGE_PATH 를 파일시스템으로 직접 읽는다(@bebe/storage 어댑터 미사용).
  // s3 모드면 /data 가 비어 있어 사진이 한 장도 안 담긴다 — DB 만 든 번들이 만들어지고
  // 화면은 "사진+영상"이라고 말한다. 조용히 두지 않고 매니페스트에 남긴다(§10).
  const storageMode = process.env.STORAGE_MODE ?? 'local'
  // 작업 디렉터리는 번들과 같은 볼륨(BACKUP_DIR/.work) — 덤프·매니페스트가 컨테이너 쓰기
  // 레이어가 아니라 백업 볼륨에 놓이고, 여유 확인도 한 볼륨만 보면 된다.
  const work = path.join(args.backupDir, '.work', id)
  await fs.mkdir(work, { recursive: true })
  const bundlePath = path.join(args.backupDir, bundleName(id))
  const dataLink = path.join(work, 'data')

  try {
    // 1. DB 덤프(항상 full, 두 스키마 포함). owner 롤 URL.
    await runFile('pg_dump', ['-Fc', '-f', path.join(work, 'db.dump'), args.databaseUrl], {
      maxBuffer: 1024 * 1024 * 64,
    })
    const dumpBytes = BigInt((await fs.stat(path.join(work, 'db.dump'))).size)

    // 2. 스토리지 파일 스캔(incr 이면 부모 이후만). tus-tmp 는 항상 제외.
    // 부모의 createdAt 은 스캔/덤프 시작 전에 캡처된 순간이라, 부모 백업이 도는 동안
    // 올라온 사진이 부모(스캔이 이미 지나감)·자식(mtime ≤ 부모 createdAt) 양쪽에서
    // 누락될 수 있다. 경계를 슬랙만큼 앞당겨 그 창의 파일을 자식에 포함시킨다 — 중복
    // 포함은 자산 불변이라 무해(전개 시 동일 내용 덮어쓰기)하고, 누락이 훨씬 위험하다.
    const INCR_SLACK_MS = 5 * 60 * 1000
    const sinceMs = parent ? new Date(parent.createdAt).getTime() - INCR_SLACK_MS : 0
    const includeDerivatives = args.includeDerivatives ?? true
    const scan = await scanDataFiles(args.dataDir, sinceMs, includeDerivatives)

    // 2b. 여유 확인 — 이 번들에 실제로 담기는 바이트 기준. 예전엔 증분이어도 데이터 디렉터리
    // 전체 크기를 요구해, 큰 라이브러리에 사진 한 장 얹는 증분이 507 로 막혔다.
    const free = await (args.freeBytesProbe ?? freeBytesOnVolume)(args.backupDir)
    const needed = BigInt(scan.bytes) + dumpBytes + BUNDLE_SPACE_MARGIN_BYTES
    if (free !== null && free < needed) throw new ServiceError(507, 'backup.insufficientSpace')

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
    const members = ['db.dump', 'manifest.json']
    if (manifest.includesSecret && args.secretKey) {
      await fs.writeFile(path.join(work, 'secret.key'), args.secretKey, { mode: 0o600 })
      members.push('secret.key')
    }

    // 5. 번들 = 메타파일 + data/ 접두 데이터파일, tar 한 번에 zstd 로 스트리밍.
    // work/data 를 데이터 디렉터리로 잇는 심볼릭링크로 두면 --transform 없이 `data/<rel>` 이름이
    // 그대로 멤버명이 된다(링크 자체는 나열하지 않으므로 멤버로 들어가지 않는다 — 복구가 링크
    // 멤버를 거부한다).
    await fs.symlink(path.resolve(args.dataDir), dataLink)
    const listFile = path.join(work, 'members.txt')
    const list = [...members, ...scan.files.map((f) => `data/${f}`)]
    await fs.writeFile(listFile, `${list.join('\n')}\n`)
    await tarToZstd(work, listFile, bundlePath)

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
    // 링크를 먼저 끊는다 — 재귀 삭제가 데이터 디렉터리 쪽으로 따라 들어가는 일이 없도록.
    await fs.unlink(dataLink).catch(() => {})
    await fs.rm(work, { recursive: true, force: true })
    await fs.rmdir(path.join(args.backupDir, '.work')).catch(() => {})
  }
}
