import { createReadStream, createWriteStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { decryptSecret } from '@/lib/crypto'
import { ServiceError } from '@/server/error'
import { getSetting } from '@/server/settings/get'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import type { PrismaClient } from '@bebe/db-public'
import { z } from 'zod'
import { resolveChainFrom } from './chain'
import { type BackupManifest, bundleName, manifestName } from './manifest'

export type RemoteConfig = {
  endpoint: string // S3 호환(MinIO/B2). 비우면 AWS S3
  region: string
  bucket: string
  prefix: string
  accessKeyId: string
  secretAccessKey: string
}

/**
 * 에러 메시지를 설정(`backup.*.last_error`)에 저장하기 전에 자격/시크릿 흔적을 가린다.
 * 이 값은 관리자 API(GET)로 노출되므로, S3 SDK·pg 에러에 섞여 들어올 수 있는 access
 * key id·DB URL 비밀번호·전달된 시크릿 리터럴을 마스킹한다. 진단용 나머지 텍스트는 유지.
 */
export function redactSecrets(msg: string, extra: string[] = []): string {
  let out = msg
  for (const lit of extra) {
    if (lit && lit.length >= 4) out = out.split(lit).join('***')
  }
  out = out.replace(/A[KS]IA[0-9A-Z]{16}/g, '***') // AWS access key id
  out = out.replace(/(postgres(?:ql)?:\/\/[^:@/\s]+:)[^@\s]+@/gi, '$1***@') // DB URL 비번
  return out
}

function makeClient(cfg: RemoteConfig): S3Client {
  return new S3Client({
    region: cfg.region || 'us-east-1',
    ...(cfg.endpoint ? { endpoint: cfg.endpoint, forcePathStyle: true } : {}),
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  })
}

function objectKey(cfg: RemoteConfig, name: string): string {
  const p = cfg.prefix.replace(/^\/+|\/+$/g, '')
  return p ? `${p}/${name}` : name
}

/** 백업 설정(원격)을 읽어 복호화한 config 를 만든다. 비활성/미설정이면 null. */
export async function loadRemoteConfig(
  prisma: PrismaClient,
  secretKey: string,
): Promise<RemoteConfig | null> {
  const enabled = await getSetting('backup.remote.enabled', z.boolean(), false, prisma)
  // 꺼져 있는 것만 null 이다. 켜져 있는데 못 쓰는 상태는 **던진다** — 예전엔 둘을 똑같이
  // null 로 돌려줘서, runBackup 의 `if (cfg)` 가 조용히 건너뛰고 catch 도 안 타 last_error 가
  // 비었다. 그러면 매일 백업이 "성공"으로 찍히고 관리자 화면은 원격이 켜져 있다고 안심시키는데
  // 실제로는 로컬에만 쌓인다(§2#6 조용한 실패 금지).
  if (!enabled) return null
  const bucket = await getSetting('backup.remote.bucket', z.string(), '', prisma)
  const accessKeyId = await getSetting('backup.remote.access_key', z.string(), '', prisma)
  const enc = await getSetting('backup.remote.secret_key', z.string(), '', prisma)
  if (!bucket || !accessKeyId || !enc) {
    throw new ServiceError(400, 'backup.remoteIncomplete')
  }
  if (!secretKey) throw new ServiceError(500, 'backup.secretKeyMissing')
  let secretAccessKey: string
  try {
    secretAccessKey = await decryptSecret(enc, secretKey)
  } catch {
    // SECRET_KEY 가 바뀌면 AES-GCM 인증이 깨진다 — 저장된 키를 다시 넣어야 한다.
    throw new ServiceError(500, 'backup.remoteSecretUndecryptable')
  }
  return {
    endpoint: await getSetting('backup.remote.endpoint', z.string(), '', prisma),
    region: await getSetting('backup.remote.region', z.string(), 'us-east-1', prisma),
    bucket,
    prefix: await getSetting('backup.remote.prefix', z.string(), '', prisma),
    accessKeyId,
    secretAccessKey,
  }
}

/** 번들 + 사이드카 매니페스트를 원격에 올린다(번들은 멀티파트 스트림). */
export async function uploadBackupToRemote(args: {
  cfg: RemoteConfig
  backupDir: string
  id: string
}): Promise<void> {
  const s3 = makeClient(args.cfg)
  try {
    const up = new Upload({
      client: s3,
      params: {
        Bucket: args.cfg.bucket,
        Key: objectKey(args.cfg, bundleName(args.id)),
        Body: createReadStream(path.join(args.backupDir, bundleName(args.id))),
      },
    })
    await up.done()
    await s3.send(
      new PutObjectCommand({
        Bucket: args.cfg.bucket,
        Key: objectKey(args.cfg, manifestName(args.id)),
        Body: await fs.readFile(path.join(args.backupDir, manifestName(args.id))),
      }),
    )
  } finally {
    s3.destroy()
  }
}

/** 원격 번들 + 매니페스트 삭제(로컬 리텐션과 동기화 — 안 그러면 원격 버킷이 무한 증가). */
export async function deleteBackupFromRemote(cfg: RemoteConfig, id: string): Promise<void> {
  const s3 = makeClient(cfg)
  try {
    await s3.send(
      new DeleteObjectCommand({ Bucket: cfg.bucket, Key: objectKey(cfg, bundleName(id)) }),
    )
    await s3.send(
      new DeleteObjectCommand({ Bucket: cfg.bucket, Key: objectKey(cfg, manifestName(id)) }),
    )
  } finally {
    s3.destroy()
  }
}

/** 자격증명·버킷 검증 — 작은 객체 PUT 후 DELETE. */
export async function testRemote(cfg: RemoteConfig): Promise<void> {
  const s3 = makeClient(cfg)
  const key = objectKey(cfg, '.bebe-backup-test')
  try {
    await s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: 'ok' }))
    await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }))
  } finally {
    s3.destroy()
  }
}

/**
 * 새 기기 복구용 — DB 가 없으니 원격 설정을 env 에서 읽는다. 앱 안에서는 설정 테이블을
 * 쓰지만(loadRemoteConfig), 디스크가 통째로 날아간 상황엔 읽을 DB 자체가 없다.
 */
export function remoteConfigFromEnv(env: NodeJS.ProcessEnv): RemoteConfig | null {
  const bucket = env.BACKUP_REMOTE_BUCKET ?? ''
  const accessKeyId = env.BACKUP_REMOTE_ACCESS_KEY ?? ''
  const secretAccessKey = env.BACKUP_REMOTE_SECRET_KEY ?? ''
  if (!bucket || !accessKeyId || !secretAccessKey) return null
  return {
    endpoint: env.BACKUP_REMOTE_ENDPOINT ?? '',
    region: env.BACKUP_REMOTE_REGION ?? 'us-east-1',
    bucket,
    prefix: env.BACKUP_REMOTE_PREFIX ?? '',
    accessKeyId,
    secretAccessKey,
  }
}

/** 버킷(prefix 하위)의 사이드카 매니페스트를 전부 읽어 최신순으로. */
export async function listRemoteBackups(cfg: RemoteConfig): Promise<BackupManifest[]> {
  const s3 = makeClient(cfg)
  const out: BackupManifest[] = []
  try {
    let token: string | undefined
    const keys: string[] = []
    do {
      const page = await s3.send(
        new ListObjectsV2Command({
          Bucket: cfg.bucket,
          ...(cfg.prefix ? { Prefix: objectKey(cfg, '') } : {}),
          ...(token ? { ContinuationToken: token } : {}),
        }),
      )
      for (const o of page.Contents ?? []) {
        if (o.Key?.endsWith('.manifest.json')) keys.push(o.Key)
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)

    for (const Key of keys) {
      const res = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key }))
      const body = await res.Body?.transformToString()
      if (!body) continue
      try {
        const m = JSON.parse(body) as BackupManifest
        // 손상·남의 파일은 조용히 건너뛴다 — 목록 하나 때문에 전체 조회가 죽으면 안 된다.
        if (m?.version === 1 && typeof m.id === 'string') out.push(m)
      } catch {
        // 매니페스트가 아닌 파일
      }
    }
  } finally {
    s3.destroy()
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

async function getToFile(s3: S3Client, bucket: string, key: string, dest: string): Promise<void> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const body = res.Body as NodeJS.ReadableStream | undefined
  if (!body) throw new Error(`원격 객체가 비어 있어요: ${key}`)
  // 부분 파일을 정상으로 오인하지 않도록 임시 이름으로 받고 마지막에 옮긴다.
  const tmp = `${dest}.part`
  await pipeline(body, createWriteStream(tmp))
  await fs.rename(tmp, dest)
}

/** 번들 + 매니페스트를 로컬 백업 디렉터리로 내려받는다. 이미 있으면 건너뛴다. */
export async function downloadBackupFromRemote(args: {
  cfg: RemoteConfig
  backupDir: string
  id: string
}): Promise<{ downloaded: boolean }> {
  const bundle = path.join(args.backupDir, bundleName(args.id))
  const manifest = path.join(args.backupDir, manifestName(args.id))
  const have = await Promise.all([
    fs.stat(bundle).then(
      () => true,
      () => false,
    ),
    fs.stat(manifest).then(
      () => true,
      () => false,
    ),
  ])
  if (have[0] && have[1]) return { downloaded: false }

  const s3 = makeClient(args.cfg)
  try {
    await fs.mkdir(args.backupDir, { recursive: true })
    await getToFile(s3, args.cfg.bucket, objectKey(args.cfg, manifestName(args.id)), manifest)
    await getToFile(s3, args.cfg.bucket, objectKey(args.cfg, bundleName(args.id)), bundle)
  } finally {
    s3.destroy()
  }
  return { downloaded: true }
}

/**
 * 복구에 필요한 체인 전체를 내려받는다(베이스 full → target).
 *
 * 증분 하나만 받아서는 복구가 안 된다 — 부모를 따라 full 까지 다 있어야 한다. 손으로
 * 고르게 두면 가장 경황 없을 때 틀리기 딱 좋아서, 목록을 읽어 체인을 계산해 받는다.
 */
export async function fetchRemoteChain(args: {
  cfg: RemoteConfig
  backupDir: string
  targetId: string
  log?: (m: string) => void
}): Promise<string[]> {
  const log = args.log ?? (() => {})
  const manifests = await listRemoteBackups(args.cfg)
  const chain = resolveChainFrom(manifests, args.targetId)
  log(`원격 체인: ${chain.map((m) => m.id).join(' → ')}`)
  for (const m of chain) {
    const { downloaded } = await downloadBackupFromRemote({
      cfg: args.cfg,
      backupDir: args.backupDir,
      id: m.id,
    })
    log(downloaded ? `내려받음: ${m.id}` : `이미 있음: ${m.id}`)
  }
  return chain.map((m) => m.id)
}
