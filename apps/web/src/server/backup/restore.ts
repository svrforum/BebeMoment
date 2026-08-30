import { execFile, spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { ServiceError } from '@/server/error'
import { findBackup } from './list'
import { resolveChainFrom } from './chain'
import { type BackupManifest, bundleName } from './manifest'

const runFile = promisify(execFile)

type Logger = (msg: string) => void

/**
 * pg_restore stderr 가 "치명적 실패"인지. --clean --if-exists 면 "does not exist"류
 * 양성 노이즈는 출력되지 않으므로, 실제 실패는 `pg_restore: error:` 라인이나
 * "errors ignored on restore: N>0" 요약으로 드러난다. 이게 true 면 반쪽 복구이므로
 * 성공으로 보고하면 안 된다(조용한 실패 금지).
 */
export function isFatalPgRestoreError(stderr: string): boolean {
  if (/pg_restore:\s*error:/i.test(stderr)) return true
  const m = stderr.match(/errors ignored on restore:\s*(\d+)/i)
  return m ? Number(m[1]) > 0 : false
}

/** target 부터 부모(parentId)를 따라 full 베이스까지 거슬러 올라간 체인(베이스→target 순). */
async function resolveChain(dir: string, targetId: string): Promise<BackupManifest[]> {
  // 디스크에서 필요한 매니페스트만 따라 읽고, 순서·베이스 판정은 원격과 같은 규칙을 쓴다.
  const loaded: BackupManifest[] = []
  const seen = new Set<string>()
  let id: string | null = targetId
  while (id && !seen.has(id)) {
    seen.add(id)
    const m = await findBackup(dir, id)
    if (!m) break
    loaded.push(m)
    id = m.parentId
  }
  return resolveChainFrom(loaded, targetId)
}

async function decompress(bundlePath: string, outTar: string): Promise<void> {
  await runFile('zstd', ['-d', '-q', '-f', '--long=27', bundlePath, '-o', outTar])
}

/** 파괴적 복구 전에 체인의 모든 번들 무결성을 검증한다(`zstd -t`). 손상 번들로 DB 를
 *  덮어쓰기 시작한 뒤 중간에 깨지면 라이브 DB 가 파손된다 — 오프사이트 미디어에서
 *  복구할 때(at-rest 손상 가능성이 가장 큼) 특히 중요. 하나라도 깨지면 시작 전에 중단. */
async function verifyChainIntegrity(
  dir: string,
  chain: BackupManifest[],
  log: Logger,
): Promise<void> {
  for (const m of chain) {
    const bundle = path.join(dir, bundleName(m.id))
    await runFile('zstd', ['-t', '--long=27', bundle]).catch((e) => {
      throw new ServiceError(
        500,
        `백업 번들이 손상됐어요(${m.id}): ${(e as Error).message.slice(0, 200)}`,
      )
    })
  }
  log(`번들 무결성 검증 완료(${chain.length}개)`)
}

// 롤 이름은 SQL 식별자라 파라미터화 불가(CREATE ROLE ${name}) → 고정 allowlist 로만
// 허용한다. 현재는 항상 이 둘이지만, 호출부가 동적이 되더라도 인젝션을 원천 차단.
const ALLOWED_ROLES = new Set(['bebe_web', 'bebe_media'])

/**
 * 롤을 새로 만들어도 되는지 판단한다(순수 — 정책만).
 *
 * 롤 이름은 SQL 식별자라 파라미터화가 안 되므로 allowlist 로만 허용하고, 비거나 추측
 * 가능한 기본 비밀번호('bebe')로 만들면 약한 자격증명이 영구 고착되므로 거부한다.
 */
export function assertRoleCreatable(name: string, password: string): void {
  if (!ALLOWED_ROLES.has(name)) throw new ServiceError(500, `허용되지 않은 롤 이름: ${name}`)
  if (!password || password === 'bebe') {
    throw new ServiceError(
      500,
      `${name} 롤을 만들려면 BEBE_WEB_DB_PASSWORD/BEBE_MEDIA_DB_PASSWORD 를 설정해야 해요`,
    )
  }
}

/**
 * psql 변수(:'var')를 쓰는 스크립트를 실행한다.
 *
 * ⚠️ `-c` 로는 안 된다 — psql 은 그 문자열을 서버로 그대로 보내므로 :'var' 가 치환되지
 * 않고 서버가 문법 오류를 낸다. 변수 치환은 파일·stdin 으로 읽은 SQL 에서만 일어난다.
 * (이걸 몰라서 새 기기 복구의 롤 생성이 통째로 깨져 있었다.)
 *
 * ON_ERROR_STOP 도 필수다 — `-f` 는 문장이 실패해도 기본값이 종료코드 0 이라, 없으면
 * 실패한 CREATE ROLE 이 성공으로 보인다.
 *
 * 실패해도 argv 는 에러에 담지 않는다 — 비밀번호가 로그·설정에 섞여 들어간다.
 */
export function psqlScript(
  url: string,
  vars: Record<string, string>,
  sql: string,
): Promise<string> {
  const args = [url, '-v', 'ON_ERROR_STOP=1']
  for (const [k, v] of Object.entries(vars)) args.push('-v', `${k}=${v}`)
  args.push('-f', '-')
  return new Promise((resolve, reject) => {
    const proc = spawn('psql', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    proc.stdout.on('data', (c: Buffer) => {
      out += c.toString()
    })
    proc.stderr.on('data', (c: Buffer) => {
      err += c.toString()
    })
    proc.on('error', (e) => reject(new Error(`psql 실행 실패: ${e.message}`)))
    proc.on('close', (code) => {
      if (code === 0) resolve(out)
      else reject(new Error(err.trim() || `psql 종료코드 ${code}`))
    })
    proc.stdin.end(sql)
  })
}

export async function ensureRole(ownerUrl: string, name: string, password: string): Promise<void> {
  if (!ALLOWED_ROLES.has(name)) throw new ServiceError(500, `허용되지 않은 롤 이름: ${name}`)
  const { stdout } = await runFile('psql', [
    ownerUrl,
    '-tAc',
    `SELECT 1 FROM pg_roles WHERE rolname='${name}'`,
  ])
  if (stdout.trim() === '1') return
  assertRoleCreatable(name, password)
  // :'pw' 는 psql 이 안전하게 인용/이스케이프(인젝션 없음).
  await psqlScript(ownerUrl, { pw: password }, `CREATE ROLE ${name} LOGIN PASSWORD :'pw';`)
}

/**
 * tar 전개 전 안전성 검사 — 백업 볼륨이 손상/위변조됐을 때 zip-slip(경로 탈출·심볼릭링크
 * 통과 쓰기)을 막는다. 절대경로·`..`·심볼릭/하드링크 멤버가 있으면 전개를 거부한다.
 */
async function assertSafeTarMembers(tarPath: string): Promise<void> {
  const names = await runFile('tar', ['-tf', tarPath])
  for (const raw of names.stdout.split('\n')) {
    const name = raw.trim()
    if (!name) continue
    if (name.startsWith('/') || name.split('/').includes('..')) {
      throw new ServiceError(500, `안전하지 않은 백업 경로: ${name}`)
    }
  }
  // verbose 리스트의 각 줄 첫 글자가 멤버 타입(l=심볼릭, h=하드링크).
  const verbose = await runFile('tar', ['-tvf', tarPath])
  for (const line of verbose.stdout.split('\n')) {
    if (line && (line[0] === 'l' || line[0] === 'h')) {
      throw new ServiceError(500, `안전하지 않은 백업 항목(링크): ${line.trim().slice(0, 120)}`)
    }
  }
}

export type RestoreArgs = {
  targetId: string
  backupDir: string
  dataDir: string
  databaseUrl: string
  rolePasswords: { web: string; media: string }
  /** 인앱 복구처럼 라이브 DB 를 덮어쓰기 전, 현재 DB 의 안전 스냅샷을 먼저 떠둔다
   *  (실패 시 수동 롤백용). CLI 새 기기 복구에선 불필요(기본 false). */
  safetySnapshot?: boolean
  log?: Logger
}

export type RestoreResult = {
  restoredId: string
  chain: string[]
  dataFilesExtracted: number
  secretKeyPath: string | null
}

/**
 * 백업 복구(CLI 용). 체인(full→target)의 데이터파일을 dataDir 에 누적 전개하고, target 의
 * db.dump 로 DB 를 복원한다(--clean). 돌아가는 앱이 없다고 가정(compose run). 시크릿 키가
 * 번들에 있으면 추출만 하고 경로를 알려준다(자동 적용 안 함).
 */
export async function restoreBackup(args: RestoreArgs): Promise<RestoreResult> {
  const log = args.log ?? (() => {})
  const chain = await resolveChain(args.backupDir, args.targetId)
  log(`복구 체인: ${chain.map((m) => m.id).join(' → ')}`)

  // 파괴적 단계 전에 번들 무결성을 먼저 검증 — 손상 번들로 DB 를 반쯤 덮어쓰는 사고 방지.
  await verifyChainIntegrity(args.backupDir, chain, log)

  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'bebe-restore-'))
  let dataFilesExtracted = 0
  let secretKeyPath: string | null = null

  try {
    // 1. 데이터파일을 베이스→target 순으로 dataDir 에 전개(불변이라 충돌 없음).
    await fs.mkdir(args.dataDir, { recursive: true })
    for (const m of chain) {
      const tar = path.join(work, `${m.id}.tar`)
      await decompress(path.join(args.backupDir, bundleName(m.id)), tar)
      // 전개 전 멤버 안전성 검사(zip-slip/심링크 통과 방지).
      await assertSafeTarMembers(tar)
      if (m.dataFileCount > 0) {
        await runFile('tar', [
          '-xf',
          tar,
          '-C',
          args.dataDir,
          '--no-same-owner',
          '--strip-components=1',
          'data',
        ]).catch((e) => {
          throw new ServiceError(500, `데이터 전개 실패(${m.id}): ${(e as Error).message}`)
        })
        dataFilesExtracted += m.dataFileCount
      }
      // target 의 메타파일(db.dump, secret.key)만 따로 꺼낸다.
      if (m.id === args.targetId) {
        const members = ['db.dump']
        if (m.includesSecret) members.push('secret.key')
        await runFile('tar', ['-xf', tar, '-C', work, '--no-same-owner', ...members])
        if (m.includesSecret) secretKeyPath = path.join(work, 'secret.key')
      }
    }
    log(`데이터 ${dataFilesExtracted}개 전개 완료`)

    // 2. 롤 보장(덤프의 GRANT 대상). 없으면 생성.
    await ensureRole(args.databaseUrl, 'bebe_web', args.rolePasswords.web)
    await ensureRole(args.databaseUrl, 'bebe_media', args.rolePasswords.media)

    // 2.5 인앱 복구: 라이브 DB 를 덮어쓰기 전 현재 상태를 안전 스냅샷으로 떠둔다.
    // best-effort — 새 기기(빈 DB)면 실패해도 계속(수동 롤백용 안전망).
    if (args.safetySnapshot) {
      const safetyPath = path.join(args.backupDir, 'pre-restore-safety.dump')
      await runFile('pg_dump', ['-Fc', '-f', safetyPath, args.databaseUrl], {
        maxBuffer: 1024 * 1024 * 64,
      })
        .then(() => log(`사전 안전 스냅샷 저장: ${safetyPath}`))
        .catch((e) => log(`사전 안전 스냅샷 실패(계속): ${(e as Error).message.slice(0, 200)}`))
    }

    // 3. 다른 연결 종료(--clean 의 DROP 이 막히지 않게).
    await runFile('psql', [
      args.databaseUrl,
      '-c',
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()',
    ]).catch(() => {})

    // 4. DB 복원(target 의 full 덤프). --clean --if-exists 로 기존 객체 교체.
    await runFile(
      'pg_restore',
      [
        '--clean',
        '--if-exists',
        '--no-owner',
        '--role=bebe',
        '-d',
        args.databaseUrl,
        path.join(work, 'db.dump'),
      ],
      { maxBuffer: 1024 * 1024 * 64 },
    ).catch((e: unknown) => {
      // pg_restore 는 --clean 의 일부 DROP 누락을 비치명적 경고로 내며 비-0 종료할 수 있다.
      // stderr 를 분류해 진짜 에러면 throw(→ 라우트가 500, 컨테이너 재시작 안 함), 양성
      // 경고면 로그만. 과거엔 전부 삼켜 반쪽 복구도 "완료"로 보고했다.
      const err = e as { stderr?: string; message?: string }
      const stderr = `${err.stderr ?? ''}\n${err.message ?? ''}`
      if (isFatalPgRestoreError(stderr)) {
        throw new ServiceError(500, `DB 복원 실패: ${stderr.trim().slice(-800)}`)
      }
      log(`pg_restore 경고: ${stderr.trim().slice(0, 500)}`)
    })
    log('DB 복원 완료')

    if (secretKeyPath) {
      // work 디렉터리는 finally 에서 지우므로 영구 위치로 복사해 알려준다.
      const persisted = path.join(args.backupDir, `${args.targetId}.secret.key`)
      await fs.copyFile(secretKeyPath, persisted)
      await fs.chmod(persisted, 0o600)
      secretKeyPath = persisted
    }

    return {
      restoredId: args.targetId,
      chain: chain.map((m) => m.id),
      dataFilesExtracted,
      secretKeyPath,
    }
  } finally {
    await fs.rm(work, { recursive: true, force: true })
  }
}
